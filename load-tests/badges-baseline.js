// SchoolFlow Pro — Baseline Load Test
// Usage: k6 run --env BASE_URL=http://localhost:8000 load-tests/badges-baseline.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const ANON_KEY = __ENV.ANON_KEY || '';

export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '1m', target: 20 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
  },
};

const headers = {
  Authorization: `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
};

export default function () {
  // Health check
  const res = http.get(`${BASE_URL}/health/`, { headers });
  check(res, { 'health ok': (r) => r.status === 200 });
  sleep(1);
}
