// Academy Guinéenne — k6 tooling smoke check.
//
// NOT a capacity test and NOT part of the 250/500/1000/2500 VU campaign
// (see docs/reports/PERF_CAMPAIGN_2026-09.md, still "NON VÉRIFIÉ" for real
// capacity numbers, which must come from a production-sized staging
// environment — never a dev machine). This exercises every shared
// business flow from lib/scenarios.js once, at trivial scale (1 VU, 1
// iteration), purely to confirm the endpoints/payloads this tooling
// depends on still match the current API before a real campaign is run —
// this codebase changes fast, and this tooling was last verified working
// end-to-end on 2026-09-27 (see PERF_CAMPAIGN_2026-09.md §11).
//
// Usage:
//   k6 run \
//     --env BASE_URL=http://localhost:8000 \
//     --env TENANTS_FILE=./tenants.smoke.json \
//     --env LOAD_TEST_TOKEN=<matches target LOAD_TEST_BYPASS_SECRET, optional> \
//     load-tests/tooling-smoke-check.js
import { sleep } from 'k6';
import {
  login, authHeaders, attendanceWrite, gradesWrite, offlineResyncBurst, readMix,
} from './lib/scenarios.js';

const tenants = JSON.parse(open(__ENV.TENANTS_FILE));
const LOAD_TEST_TOKEN = __ENV.LOAD_TEST_TOKEN || '';

export const options = { vus: 1, iterations: 1 };

export default function () {
  const tenant = tenants[0];
  const loginHeaders = LOAD_TEST_TOKEN ? { 'X-Load-Test-Token': LOAD_TEST_TOKEN } : {};
  const token = login(tenant, loginHeaders);
  if (!token) throw new Error('login failed — see checks above');
  const headers = authHeaders(token, tenant);

  console.log('--- readMix (dashboard, students, results, payments, notifications) ---');
  readMix(headers, tenant);
  sleep(0.2);

  console.log('--- attendanceWrite ---');
  attendanceWrite(headers, tenant);
  sleep(0.2);

  console.log('--- gradesWrite ---');
  gradesWrite(headers, tenant);
  sleep(0.2);

  console.log('--- offlineResyncBurst ---');
  offlineResyncBurst(headers, tenant, 3);
}
