// Academy Guinéenne — Smoke load test (no authentication required)
// Validates that the stack stays healthy under light concurrent traffic.
//
// Usage:
//   k6 run --env BASE_URL=http://localhost:8000 load-tests/smoke.js
//
// national-readiness audit, 2026-09: even this smoke test's default 5 VUs
// (~11 req/s from one source IP) exceed app.main's app-wide default rate
// limit (100/minute per IP — see app/core/client_ip.py), producing ~50%
// HTTP 429 on every request including health checks, well before the app's
// actual capacity is tested. Set LOAD_TEST_TOKEN to the target's
// LOAD_TEST_BYPASS_SECRET (inert unless a deployment operator deliberately
// configured it — see docs/runbooks/load-testing.md) to exempt this run:
//   k6 run --env BASE_URL=... --env LOAD_TEST_TOKEN=... load-tests/smoke.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const LOAD_TEST_TOKEN = __ENV.LOAD_TEST_TOKEN || '';
const params = LOAD_TEST_TOKEN ? { headers: { 'X-Load-Test-Token': LOAD_TEST_TOKEN } } : {};

export const options = {
  stages: [
    { duration: '15s', target: 5 },
    { duration: '30s', target: 5 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const ready = http.get(`${BASE_URL}/health/ready`, params);
  check(ready, {
    'health/ready is 200': (r) => r.status === 200,
    'database connected': (r) => r.json('components.database') === 'connected',
  });

  const live = http.get(`${BASE_URL}/health/live`, params);
  check(live, { 'health/live is 200': (r) => r.status === 200 });

  const root = http.get(`${BASE_URL}/`, params);
  check(root, { 'root is 200': (r) => r.status === 200 });

  sleep(1);
}
