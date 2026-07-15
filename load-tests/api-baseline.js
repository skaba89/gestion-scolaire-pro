// SchoolFlow Pro — Authenticated API baseline
// Exercises the hot read paths of a school day: students, invoices,
// analytics overview and notifications.
//
// Usage:
//   k6 run \
//     --env BASE_URL=http://localhost:8000 \
//     --env LOGIN_EMAIL=admin@school.test \
//     --env LOGIN_PASSWORD=... \
//     load-tests/api-baseline.js
//
// The login endpoint is rate-limited (5/minute): the token is fetched once
// in setup() and shared by every virtual user.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const API = `${BASE_URL}/api/v1`;

export const options = {
  stages: [
    { duration: '30s', target: 10 },  // ramp-up
    { duration: '2m', target: 25 },   // plateau — une école active
    { duration: '30s', target: 50 },  // pointe — rentrée / résultats
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
};

export function setup() {
  const email = __ENV.LOGIN_EMAIL;
  const password = __ENV.LOGIN_PASSWORD;
  if (!email || !password) {
    throw new Error('LOGIN_EMAIL and LOGIN_PASSWORD are required');
  }
  const res = http.post(`${API}/auth/login/`, {
    username: email,
    password: password,
  });
  if (res.status !== 200) {
    throw new Error(`login failed: ${res.status} ${res.body}`);
  }
  return { token: res.json('access_token') };
}

export default function (data) {
  const headers = { Authorization: `Bearer ${data.token}` };

  const students = http.get(`${API}/students/?page=1&page_size=25`, { headers });
  check(students, { 'students list is 200': (r) => r.status === 200 });

  const invoices = http.get(`${API}/invoices/`, { headers });
  check(invoices, { 'invoices list is 200': (r) => r.status === 200 });

  const overview = http.get(`${API}/analytics/overview/`, { headers });
  check(overview, { 'analytics overview is 200': (r) => r.status === 200 });

  const notifications = http.get(`${API}/notifications/`, { headers });
  check(notifications, { 'notifications list is 200': (r) => r.status === 200 });

  sleep(Math.random() * 2 + 1); // 1-3 s think time
}
