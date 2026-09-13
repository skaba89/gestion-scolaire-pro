// Academy Guinéenne — Load-test CAMPAIGN (pré-déploiement multi-établissement
// puis national). One run per VU tier: 250 (baseline) → 500 → 1000 → 2500.
//
// Business mix per iteration (realistic school-day traffic, read-heavy with a
// minority of writes): dashboard, students, results, payments, notifications,
// and — when WRITE_SCENARIOS=1 — attendance entry, grade entry, and an
// offline reconnect resync burst. A separate low-rate `login_probe` scenario
// measures login latency under load without tripping the 5/min rate limit.
//
// ⚠️ NEVER against production. See docs/runbooks/load-testing.md and
// docs/reports/PERF_CAMPAIGN_2026-09.md.
//
// Usage (one tier):
//   k6 run \
//     --env BASE_URL=http://localhost:8000 \
//     --env TENANTS_FILE=./load-tests/tenants.50.json \
//     --env TIER=250 \
//     --env LOAD_TEST_TOKEN=<matches target LOAD_TEST_BYPASS_SECRET> \
//     --env WRITE_SCENARIOS=1 \
//     --summary-export=results/campaign-250-summary.json \
//     --out json=results/campaign-250-raw.json \
//     load-tests/campaign.js
//
// The whole ladder + infra metrics is orchestrated by
// load-tests/run-campaign.sh.
import http from 'k6/http';
import { sleep } from 'k6';
import { SharedArray } from 'k6/data';
import {
  API, login, authHeaders, readMix,
  attendanceWrite, gradesWrite, offlineResyncBurst,
} from './lib/scenarios.js';

const TIER = __ENV.TIER || '250';
const WRITE = __ENV.WRITE_SCENARIOS === '1';
const LOAD_TEST_TOKEN = __ENV.LOAD_TEST_TOKEN || '';
const THINK_MIN = Number(__ENV.THINK_MIN || 1);
const THINK_MAX = Number(__ENV.THINK_MAX || 4);

const tenants = new SharedArray('tenants', function () {
  const path = __ENV.TENANTS_FILE;
  if (!path) {
    throw new Error(
      'TENANTS_FILE is required — a JSON array of ' +
      '{slug, email, password, student_id?, subject_id?, classroom_id?, assessment_id?}. ' +
      'See load-tests/seed-load-test-tenants.md.',
    );
  }
  return JSON.parse(open(path));
});

// Ramp profiles per tier. Long enough plateaus that a saturation knee shows
// as a sustained latency/error rise, not a transient ramp artefact.
const TIER_STAGES = {
  '250': [
    { duration: '1m', target: 100 },
    { duration: '3m', target: 250 },
    { duration: '1m', target: 0 },
  ],
  '500': [
    { duration: '1m', target: 200 },
    { duration: '4m', target: 500 },
    { duration: '1m', target: 0 },
  ],
  '1000': [
    { duration: '2m', target: 400 },
    { duration: '4m', target: 1000 },
    { duration: '2m', target: 0 },
  ],
  '2500': [
    { duration: '2m', target: 800 },
    { duration: '3m', target: 1600 },
    { duration: '4m', target: 2500 },
    { duration: '2m', target: 0 },
  ],
};

const stages = TIER_STAGES[TIER] || TIER_STAGES['250'];

export const options = {
  setupTimeout: '15m',
  summaryTrendStats: ['avg','min','med','p(50)','p(90)','p(95)','p(99)','max','count'],
  scenarios: {
    business: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages,
      gracefulRampDown: '30s',
      exec: 'business',
    },
    // Continuously measure login latency under the load above. 1 iter/s is
    // well under any real login volume and (with LOAD_TEST_TOKEN) exempt from
    // the 5/min limiter, so it never distorts the business mix.
    login_probe: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1s',
      duration: totalDuration(stages),
      preAllocatedVUs: 5,
      maxVUs: 20,
      exec: 'loginProbe',
    },
  },
  // Explicit SUCCESS thresholds (SLOs). abortOnFail:false everywhere — a
  // breached threshold marks the tier as "past SLO" (a saturation signal)
  // but the run still completes so we capture the full curve. The FIRST tier
  // that breaches these is the first saturation point.
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: false }],
    http_req_duration: [
      { threshold: 'p(95)<800', abortOnFail: false },
      { threshold: 'p(99)<2000', abortOnFail: false },
    ],
    checks: [{ threshold: 'rate>0.99', abortOnFail: false }],
    request_timeouts: [{ threshold: 'count<1', abortOnFail: false }],
    'flow_login_ms': [{ threshold: 'p(95)<1000', abortOnFail: false }],
    'flow_dashboard_ms': [{ threshold: 'p(95)<800', abortOnFail: false }],
    'flow_students_list_ms': [{ threshold: 'p(95)<600', abortOnFail: false }],
    'flow_results_read_ms': [{ threshold: 'p(95)<800', abortOnFail: false }],
    'flow_payments_read_ms': [{ threshold: 'p(95)<800', abortOnFail: false }],
    'flow_notifications_ms': [{ threshold: 'p(95)<600', abortOnFail: false }],
    'flow_attendance_write_ms': [{ threshold: 'p(95)<1000', abortOnFail: false }],
    'flow_grades_write_ms': [{ threshold: 'p(95)<1000', abortOnFail: false }],
    'flow_offline_resync_burst_ms': [{ threshold: 'p(95)<2500', abortOnFail: false }],
  },
};

function totalDuration(st) {
  // sum stage durations (all expressed in m/s here) → e.g. "5m0s"
  let secs = 0;
  for (const s of st) {
    const m = /(\d+)m/.exec(s.duration);
    const sec = /(\d+)s/.exec(s.duration);
    if (m) secs += Number(m[1]) * 60;
    if (sec) secs += Number(sec[1]);
  }
  return `${secs}s`;
}

function pickTenant() {
  return tenants[Math.floor(Math.random() * tenants.length)];
}

export function setup() {
  // One login per tenant (auth is rate-limited 5/min PER IP; all VUs share
  // one source IP). With LOAD_TEST_TOKEN the logins are exempt and run
  // back-to-back; without it, space them 13s apart (safe but slow past a
  // handful of tenants — see full-journey.js).
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

export function business(data) {
  const tenant = pickTenant();
  const token = data.tokensBySlug[tenant.slug];
  const headers = authHeaders(token, tenant);

  readMix(headers, tenant);

  if (WRITE) {
    // Writes are a minority of real traffic — ~1 iteration in 4 does them.
    if (__ITER % 4 === 0) attendanceWrite(headers, tenant);
    if (__ITER % 4 === 1) gradesWrite(headers, tenant);
    if (__ITER % 20 === 0) offlineResyncBurst(headers, tenant, 5);
  }

  sleep(Math.random() * (THINK_MAX - THINK_MIN) + THINK_MIN);
}

export function loginProbe() {
  const tenant = pickTenant();
  const headers = LOAD_TEST_TOKEN ? { 'X-Load-Test-Token': LOAD_TEST_TOKEN } : {};
  login(tenant, headers);
}
