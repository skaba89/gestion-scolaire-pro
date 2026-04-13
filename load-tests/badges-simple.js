// SchoolFlow Pro — Simple Smoke Load Test
// Usage: k6 run --env BASE_URL=http://localhost:8000 load-tests/badges-simple.js
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

export const options = {
  vus: 1,
  iterations: 10,
};

export default function () {
  const res = http.get(`${BASE_URL}/health/`);
  check(res, {
    'health is 200': (r) => r.status === 200,
  });
}
