// SchoolFlow Pro — Smoke load test (no authentication required)
// Validates that the stack stays healthy under light concurrent traffic.
//
// Usage:
//   k6 run --env BASE_URL=http://localhost:8000 load-tests/smoke.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

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
  const ready = http.get(`${BASE_URL}/health/ready`);
  check(ready, {
    'health/ready is 200': (r) => r.status === 200,
    'database connected': (r) => r.json('components.database') === 'connected',
  });

  const live = http.get(`${BASE_URL}/health/live`);
  check(live, { 'health/live is 200': (r) => r.status === 200 });

  const root = http.get(`${BASE_URL}/`);
  check(root, { 'root is 200': (r) => r.status === 200 });

  sleep(1);
}
