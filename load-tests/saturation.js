// Academy Guinéenne — SATURATION finder.
//
// A VU-count ramp (campaign.js) tells you latency AT a concurrency level; it
// does not directly tell you the maximum sustainable throughput, because VUs
// slow their own request rate as the server slows (closed model). This script
// uses an OPEN model — `ramping-arrival-rate` — which injects a target
// requests/second REGARDLESS of how fast the server responds. As the server
// approaches capacity, latency and errors rise while achieved RPS plateaus:
// that plateau/knee is the first real saturation point, read objectively.
//
// Read the result as: the arrival rate (req/s) at which p95 crosses the SLO
// (800ms) or http_req_failed crosses 1% is the saturation throughput. Cross-
// reference with load-tests/capture-infra-metrics.sh output to attribute the
// knee to a resource (DB pool exhausted? Postgres connections? CPU? Redis?).
//
// ⚠️ NEVER against production. See docs/reports/PERF_CAMPAIGN_2026-09.md.
//
// Usage:
//   k6 run \
//     --env BASE_URL=http://localhost:8000 \
//     --env TENANTS_FILE=./load-tests/tenants.50.json \
//     --env LOAD_TEST_TOKEN=<...> \
//     --env START_RPS=50 --env MAX_RPS=2000 --env STEP_DURATION=1m \
//     --summary-export=results/saturation-summary.json \
//     --out json=results/saturation-raw.json \
//     load-tests/saturation.js
import { sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { authHeaders, readMix, login } from './lib/scenarios.js';

const LOAD_TEST_TOKEN = __ENV.LOAD_TEST_TOKEN || '';
const START_RPS = Number(__ENV.START_RPS || 50);
const MAX_RPS = Number(__ENV.MAX_RPS || 2000);
const STEP = __ENV.STEP_DURATION || '1m';

const tenants = new SharedArray('tenants', function () {
  const path = __ENV.TENANTS_FILE;
  if (!path) throw new Error('TENANTS_FILE is required (see seed-load-test-tenants.md)');
  return JSON.parse(open(path));
});

// Staircase of arrival rates from START_RPS to MAX_RPS. Each step holds a
// fixed req/s long enough (STEP) to see whether the server sustains it.
function buildStages() {
  const stages = [];
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    const target = Math.round(START_RPS + ((MAX_RPS - START_RPS) * i) / steps);
    stages.push({ target, duration: STEP });
  }
  return stages;
}

export const options = {
  setupTimeout: '15m',
  summaryTrendStats: ['avg','min','med','p(50)','p(90)','p(95)','p(99)','max','count'],
  scenarios: {
    saturation: {
      executor: 'ramping-arrival-rate',
      startRate: START_RPS,
      timeUnit: '1s',
      // Give k6 enough VUs to keep injecting the target rate even as the
      // server slows; if maxVUs is hit, k6 reports "dropped_iterations" —
      // itself a saturation signal (the load generator can't keep up because
      // the server can't drain requests fast enough).
      preAllocatedVUs: 200,
      maxVUs: 3000,
      stages: buildStages(),
      exec: 'hit',
    },
  },
  thresholds: {
    // Not abort — we WANT to ride past the knee to locate it precisely.
    http_req_duration: [{ threshold: 'p(95)<800', abortOnFail: false }],
    http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: false }],
    dropped_iterations: [{ threshold: 'count<1', abortOnFail: false }],
  },
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

export function hit(data) {
  const tenant = pickTenant();
  const headers = authHeaders(data.tokensBySlug[tenant.slug], tenant);
  // No think time: the arrival-rate executor controls pacing, not the VU.
  readMix(headers, tenant);
}
