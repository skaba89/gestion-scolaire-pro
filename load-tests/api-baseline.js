// Academy Guinéenne — Authenticated API baseline
// Exercises the hot read paths of a school day: students, invoices,
// analytics overview and notifications.
//
// Usage:
//   k6 run \
//     --env BASE_URL=http://localhost:8000 \
//     --env LOGIN_EMAIL=admin@school.test \
//     --env LOGIN_PASSWORD=... \
//     --env LOGIN_TOTP_SECRET=... \
//     load-tests/api-baseline.js
//
// LOGIN_TOTP_SECRET (base32) is only required if the account has TOTP MFA
// enrolled — mandatory for privileged roles like TENANT_ADMIN once the
// target enforces ENFORCE_MFA=true (the default outside DEBUG).
//
// The login endpoint is rate-limited (5/minute): the token is fetched once
// in setup() and shared by every virtual user.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { generateTotp } from './lib/totp.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const API = `${BASE_URL}/api/v1`;
// national-readiness audit, 2026-09: this script's 25-50 VU plateau
// stages generate well over 100 req/minute from one source IP —
// app.main's app-wide default limiter (100/minute per IP) throttles
// students/invoices/analytics/notifications reads below unless a
// LOAD_TEST_TOKEN matching the target's LOAD_TEST_BYPASS_SECRET is set
// (inert unless a deployment operator deliberately configured it — see
// docs/runbooks/load-testing.md). Discovered by actually running
// load-tests/smoke.js against a live instance for the first time.
const LOAD_TEST_TOKEN = __ENV.LOAD_TEST_TOKEN || '';

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
  const totpSecret = __ENV.LOGIN_TOTP_SECRET || '';
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
  // SECURITY (national-readiness audit, 2026-09) made MFA mandatory for
  // privileged roles (TENANT_ADMIN among them) after this script was
  // first built — a login account with MFA enrolled now returns
  // {mfa_required: true, mfa_token: ...} here instead of a usable
  // access_token (see lib/scenarios.js::login() for the same fix applied
  // to campaign.js/saturation.js/resilience.js). Discovered by actually
  // running this script's tooling against a live instance for the first
  // time. Pass --env LOGIN_TOTP_SECRET=<base32 secret> for an account
  // enrolled in TOTP MFA.
  if (res.json('mfa_required')) {
    if (!totpSecret) {
      throw new Error('login requires MFA but LOGIN_TOTP_SECRET was not provided');
    }
    const verifyRes = http.post(`${API}/mfa/login/verify/`, JSON.stringify({
      mfa_token: res.json('mfa_token'),
      code: generateTotp(totpSecret),
    }), { headers: { 'Content-Type': 'application/json' } });
    if (verifyRes.status !== 200) {
      throw new Error(`MFA verify failed: ${verifyRes.status} ${verifyRes.body}`);
    }
    return { token: verifyRes.json('access_token') };
  }
  return { token: res.json('access_token') };
}

export default function (data) {
  const headers = { Authorization: `Bearer ${data.token}` };
  if (LOAD_TEST_TOKEN) headers['X-Load-Test-Token'] = LOAD_TEST_TOKEN;

  const students = http.get(`${API}/students/?page=1&page_size=25`, { headers });
  check(students, { 'students list is 200': (r) => r.status === 200 });

  const invoices = http.get(`${API}/invoices/`, { headers });
  check(invoices, { 'invoices list is 200': (r) => r.status === 200 });

  // /analytics/overview/ does not exist — analytics.py exposes granular
  // endpoints instead (academic-kpis, financial-kpis, ...). Found while
  // actually running a real k6 campaign (load-tests/full-journey.js had
  // the identical bug — every "analytics" check here has been silently
  // 404ing since this script was written).
  const overview = http.get(`${API}/analytics/academic-kpis/`, { headers });
  check(overview, { 'analytics overview is 200': (r) => r.status === 200 });

  const notifications = http.get(`${API}/notifications/`, { headers });
  check(notifications, { 'notifications list is 200': (r) => r.status === 200 });

  sleep(Math.random() * 2 + 1); // 1-3 s think time
}
