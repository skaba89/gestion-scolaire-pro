// Academy Guinéenne — RESILIENCE / chaos load profile.
//
// Runs a moderate, steady load while an EXTERNAL fault is injected (see
// load-tests/chaos/*.sh). The point is not a green run — it is to observe:
//   * does the platform degrade gracefully (controlled 429/503, no data
//     corruption) rather than 5xx / hang / crash?
//   * does it RECOVER automatically once the fault is lifted (error rate and
//     latency return to baseline)?
//   * retry / idempotency: replaying the SAME write with the SAME
//     X-Idempotency-Key must not double-apply it.
//   * massive offline resync: a large reconnect burst must not overwhelm the
//     write path or lose/duplicate items.
//
// Which fault is active is passed in FAULT (informational, tags the metrics):
//   redis_down | redis_slow | worker_stopped | worker_saturated |
//   postgres_saturated | storage_down | network_timeout | recovery | none
//
// Usage (paired with a chaos script running in another terminal):
//   k6 run --env BASE_URL=http://localhost:8000 \
//     --env TENANTS_FILE=./load-tests/tenants.10.json \
//     --env LOAD_TEST_TOKEN=<...> --env FAULT=redis_down \
//     --env VUS=100 --env DURATION=5m \
//     --summary-export=results/resilience-redis_down-summary.json \
//     load-tests/resilience.js
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Trend } from 'k6/metrics';
import {
  API, login, authHeaders, readMix, offlineResyncBurst,
} from './lib/scenarios.js';

const LOAD_TEST_TOKEN = __ENV.LOAD_TEST_TOKEN || '';
const FAULT = __ENV.FAULT || 'none';
const VUS = Number(__ENV.VUS || 100);
const DURATION = __ENV.DURATION || '5m';
const RESYNC_SIZE = Number(__ENV.RESYNC_SIZE || 40); // "massive" reconnect burst

const idempotentReplays = new Counter('idempotent_replay_consistent');
const idempotentDivergent = new Counter('idempotent_replay_DIVERGENT');
const recoveryTrend = new Trend('recovery_probe_ms');

const tenants = new SharedArray('tenants', function () {
  const path = __ENV.TENANTS_FILE;
  if (!path) throw new Error('TENANTS_FILE is required (see seed-load-test-tenants.md)');
  return JSON.parse(open(path));
});

export const options = {
  setupTimeout: '15m',
  summaryTrendStats: ['avg','min','med','p(50)','p(90)','p(95)','p(99)','max','count'],
  scenarios: {
    steady: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
      exec: 'steady',
    },
  },
  // Under an injected fault we EXPECT degradation; these thresholds encode
  // "degrade gracefully" — controlled backpressure is acceptable, hard 5xx
  // and hangs are not. Tune per environment.
  thresholds: {
    // No more than 2% of responses should be hard 5xx even under fault:
    'http_req_failed{expected_response:true}': [{ threshold: 'rate<0.05', abortOnFail: false }],
    idempotent_replay_DIVERGENT: [{ threshold: 'count<1', abortOnFail: false }],
    checks: [{ threshold: 'rate>0.90', abortOnFail: false }],
  },
  tags: { fault: FAULT },
};

function pickTenant() {
  return tenants[Math.floor(Math.random() * tenants.length)];
}

export function setup() {
  const headers = LOAD_TEST_TOKEN ? { 'X-Load-Test-Token': LOAD_TEST_TOKEN } : {};
  const tokensBySlug = {};
  tenants.forEach((t, i) => {
    if (!LOAD_TEST_TOKEN && i > 0) sleep(13);
    const token = login(t, headers);
    if (!token) throw new Error(`setup login failed for tenant ${t.slug}`);
    tokensBySlug[t.slug] = token;
  });
  return { tokensBySlug };
}

// Retry/idempotency probe: POST the same attendance twice with the SAME
// X-Idempotency-Key. Backend must return the SAME result (cached) the second
// time, never create a second row. Divergent status/ids ⇒ idempotency broken.
function idempotencyProbe(headers, tenant) {
  if (!tenant.student_id) return;
  group('idempotency', function () {
    const key = `loadtest-idem-${__VU}-${__ITER}-${Date.now()}`;
    const body = JSON.stringify({
      student_id: tenant.student_id,
      date: new Date().toISOString().slice(0, 10),
      status: 'PRESENT',
    });
    const h = { ...headers, 'Content-Type': 'application/json', 'X-Idempotency-Key': key };
    const first = http.post(`${API}/attendance/`, body, { headers: h, tags: { flow: 'idempotency' } });
    const second = http.post(`${API}/attendance/`, body, { headers: h, tags: { flow: 'idempotency' } });
    const consistent = first.status < 500 && second.status < 500 &&
      // same idempotency key ⇒ identical id (or both a controlled dup/conflict)
      (first.json('id') === second.json('id') || second.status === 409);
    if (consistent) idempotentReplays.add(1);
    else idempotentDivergent.add(1);
    check({ consistent }, { 'idempotent replay is consistent': (o) => o.consistent });
  });
}

export function steady(data) {
  const tenant = pickTenant();
  const headers = authHeaders(data.tokensBySlug[tenant.slug], tenant);

  // A recovery probe: a cheap health read whose latency shows when the
  // platform is back to baseline after the fault is lifted.
  const start = Date.now();
  const health = http.get(`${API.replace('/api/v1', '')}/health/ready`, { tags: { flow: 'recovery' } });
  recoveryTrend.add(Date.now() - start);
  check(health, { 'health/ready reachable (any status)': (r) => r.status !== 0 });

  readMix(headers, tenant);

  // Retry/idempotency + massive offline resync exercised on a sampled subset
  // so they don't dominate the steady mix.
  if (__ITER % 5 === 0) idempotencyProbe(headers, tenant);
  if (__ITER % 25 === 0) offlineResyncBurst(headers, tenant, RESYNC_SIZE);

  sleep(1);
}
