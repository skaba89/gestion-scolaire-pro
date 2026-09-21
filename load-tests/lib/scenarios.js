// Academy Guinéenne — shared load-test scenario library.
//
// Real business flows, using the ACTUAL API paths/payloads (verified against
// backend/app/api/v1/endpoints and app/schemas). Imported by campaign.js,
// saturation.js and resilience.js so every entrypoint exercises the SAME
// flows and per-flow latency Trends — no drift between scripts.
//
// ⚠️ NEVER run against production (see docs/runbooks/load-testing.md). Target
// a local Docker stack or a dedicated, prod-sized staging environment seeded
// with synthetic tenants (see load-tests/seed-load-test-tenants.md).
import http from 'k6/http';
import { check, group } from 'k6';
import { Trend, Counter } from 'k6/metrics';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
export const API = `${BASE_URL}/api/v1`;

// Per-flow latency, so a slow write path is never averaged away by fast
// reads in the aggregate http_req_duration.
export const trends = {
  login: new Trend('flow_login_ms'),
  dashboard: new Trend('flow_dashboard_ms'),
  students: new Trend('flow_students_list_ms'),
  attendance_write: new Trend('flow_attendance_write_ms'),
  grades_write: new Trend('flow_grades_write_ms'),
  results: new Trend('flow_results_read_ms'),
  payments: new Trend('flow_payments_read_ms'),
  notifications: new Trend('flow_notifications_ms'),
  offline_resync: new Trend('flow_offline_resync_burst_ms'),
};

// Timeouts / dropped requests are reported by k6 as status 0; count them
// explicitly (a mandatory campaign metric distinct from HTTP 5xx errors).
export const timeouts = new Counter('request_timeouts');
// Backpressure the platform returns on purpose (429/503) vs hard failures.
export const backpressure = new Counter('responses_backpressure');

function track(resp) {
  if (resp.status === 0) timeouts.add(1);
  if (resp.status === 429 || resp.status === 503) backpressure.add(1);
  return resp;
}

// A revoked/expired-token 401 during a campaign is a config error, not load —
// surface it distinctly from 5xx so results aren't misread.
function ok2xx(r) {
  return r.status >= 200 && r.status < 300;
}
function not5xx(r) {
  return r.status < 500;
}

export function login(tenant, extraHeaders = {}) {
  const start = Date.now();
  const res = track(http.post(`${API}/auth/login/`, {
    username: tenant.email,
    password: tenant.password,
  }, { headers: extraHeaders, tags: { flow: 'login' } }));
  trends.login.add(Date.now() - start);
  check(res, { 'login 200': (r) => r.status === 200 });
  return res.status === 200 ? res.json('access_token') : null;
}

// national-readiness audit, 2026-09: campaign.js/saturation.js/
// resilience.js/full-journey.js already attached X-Load-Test-Token to the
// LOGIN request only — every subsequent business call (dashboard,
// students, grades, attendance, ...) built from THIS function's headers
// carried no bypass at all. A real k6 run generates every request from
// one source IP, and app.main's app-wide default limiter (100/minute per
// IP — see app/core/client_ip.py) applies to those endpoints exactly like
// it applies to login — discovered by actually running load-tests/smoke.js
// against a live instance (see docs/reports/PERF_CAMPAIGN_2026-09.md's
// "NON VÉRIFIÉ" note: no run had ever been executed before). Without this,
// every VU beyond the first ~100 requests/minute total (not per VU — total,
// across the whole campaign) would 429 on ordinary reads/writes, long
// before any real capacity signal. LOAD_TEST_TOKEN read directly here
// (not threaded through every call site) since every scenario function
// already takes `headers` from this one place.
const LOAD_TEST_TOKEN = __ENV.LOAD_TEST_TOKEN || '';

export function authHeaders(token, tenant) {
  const headers = { Authorization: `Bearer ${token}`, 'X-Tenant-ID': tenant.slug };
  if (LOAD_TEST_TOKEN) headers['X-Load-Test-Token'] = LOAD_TEST_TOKEN;
  return headers;
}

// ─── Read flows ──────────────────────────────────────────────────────────────
export function dashboard(headers) {
  group('dashboard', function () {
    const start = Date.now();
    // analytics.py exposes granular KPI endpoints (no /overview/).
    const kpis = track(http.get(`${API}/analytics/academic-kpis/`, { headers, tags: { flow: 'dashboard' } }));
    const fin = track(http.get(`${API}/analytics/financial-kpis/`, { headers, tags: { flow: 'dashboard' } }));
    trends.dashboard.add(Date.now() - start);
    check(kpis, { 'dashboard academic-kpis 2xx': ok2xx });
    check(fin, { 'dashboard financial-kpis 2xx': ok2xx });
  });
}

export function studentsList(headers) {
  group('students', function () {
    const start = Date.now();
    const r = track(http.get(`${API}/students/?page=1&page_size=25`, { headers, tags: { flow: 'students' } }));
    trends.students.add(Date.now() - start);
    check(r, { 'students list 2xx': ok2xx });
  });
}

export function notifications(headers) {
  group('notifications', function () {
    const start = Date.now();
    const r = track(http.get(`${API}/notifications/`, { headers, tags: { flow: 'notifications' } }));
    trends.notifications.add(Date.now() - start);
    check(r, { 'notifications 2xx': ok2xx });
  });
}

export function results(headers, tenant) {
  group('results', function () {
    const start = Date.now();
    // Consultation résultats: paginated grade list + a per-student average
    // (the two calls a "consult results" screen makes).
    const list = track(http.get(`${API}/grades/?page=1&page_size=25`, { headers, tags: { flow: 'results' } }));
    check(list, { 'grades list 2xx': ok2xx });
    if (tenant.student_id) {
      const avg = track(http.get(`${API}/grades/student/${tenant.student_id}/average/`, { headers, tags: { flow: 'results' } }));
      check(avg, { 'student average 2xx-or-404': (r) => ok2xx(r) || r.status === 404 });
    }
    trends.results.add(Date.now() - start);
  });
}

export function paymentsRead(headers) {
  group('payments', function () {
    const start = Date.now();
    // Read path (list invoices). Payment-intent creation needs a real
    // Mobile Money provider + invoice_id and is out of scope for a
    // repeatable load loop (see full-journey.js rationale).
    const r = track(http.get(`${API}/invoices/`, { headers, tags: { flow: 'payments' } }));
    trends.payments.add(Date.now() - start);
    check(r, { 'invoices list 2xx': ok2xx });
  });
}

// ─── Write flows ───────────────────────────────────────────────────────────
// Enabled only when WRITE_SCENARIOS=1 AND the tenant fixture carries the
// required ids, so a read-only campaign never mutates the target DB.
export function attendanceWrite(headers, tenant) {
  if (!tenant.student_id) return;
  group('attendance_write', function () {
    const start = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const body = {
      student_id: tenant.student_id,
      date: today,
      status: 'PRESENT',
      reason: null,
    };
    if (tenant.subject_id) body.subject_id = tenant.subject_id;
    if (tenant.classroom_id) body.classroom_id = tenant.classroom_id;
    // POST /attendance/ (academic/attendance.py) — supports X-Idempotency-Key.
    const r = track(http.post(`${API}/attendance/`, JSON.stringify(body), {
      headers: { ...headers, 'Content-Type': 'application/json' },
      tags: { flow: 'attendance_write' },
    }));
    trends.attendance_write.add(Date.now() - start);
    check(r, { 'attendance write 2xx (or 409 dup)': (r) => ok2xx(r) || r.status === 409 });
  });
}

export function gradesWrite(headers, tenant) {
  if (!tenant.student_id) return;
  group('grades_write', function () {
    const start = Date.now();
    const body = {
      student_id: tenant.student_id,
      score: 12 + (__ITER % 8),
      max_score: 20,
      coefficient: 1,
      comments: `loadtest VU${__VU} iter${__ITER}`,
    };
    if (tenant.subject_id) body.subject_id = tenant.subject_id;
    if (tenant.assessment_id) body.assessment_id = tenant.assessment_id;
    const r = track(http.post(`${API}/grades/`, JSON.stringify(body), {
      headers: { ...headers, 'Content-Type': 'application/json' },
      tags: { flow: 'grades_write' },
    }));
    trends.grades_write.add(Date.now() - start);
    check(r, { 'grade write 2xx (or 409 dup)': (r) => ok2xx(r) || r.status === 409 });
  });
}

// Reconnect burst: a device that was offline replays its queued writes
// (IndexedDB outbox — src/offline/) against the normal endpoints the moment
// connectivity returns. `size` writes back-to-back, no think time.
export function offlineResyncBurst(headers, tenant, size = 5) {
  if (!tenant.student_id) return;
  group('offline_resync', function () {
    const start = Date.now();
    for (let i = 0; i < size; i++) {
      const r = track(http.post(`${API}/school-life/check-ins/`, JSON.stringify({
        student_id: tenant.student_id,
        direction: i % 2 === 0 ? 'IN' : 'OUT',
        source: 'LOADTEST_OFFLINE_SYNC',
      }), {
        headers: { ...headers, 'Content-Type': 'application/json' },
        tags: { flow: 'offline_resync' },
      }));
      check(r, { 'resync item handled (not 5xx)': not5xx });
    }
    trends.offline_resync.add(Date.now() - start);
  });
}

// A read-heavy "school day" mix: what most VUs do most of the time.
export function readMix(headers, tenant) {
  dashboard(headers);
  studentsList(headers);
  notifications(headers);
  results(headers, tenant);
  paymentsRead(headers);
}
