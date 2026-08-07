// Academy Guinéenne — Parcours complet multi-tenant (Phase 5, brief
// robustesse pré-commercialisation large).
//
// Étend load-tests/api-baseline.js (lecture authentifiée seule) avec les
// parcours demandés par le brief : dashboard, pages publiques, formulaire
// de contact, imports légers, paiements, WhatsApp simulé (webhook Meta),
// synchronisation hors-ligne simulée (rafale d'écritures à la reconnexion).
//
// ⚠️ JAMAIS CONTRE LA PRODUCTION — même règle que load-tests/smoke.js et
// api-baseline.js (voir docs/runbooks/load-testing.md). Ce script cible un
// environnement local Docker ou de staging provisionné avec des tenants
// synthétiques dédiés. Le exécuter contre https://schoolflow-api-r8u7.onrender.com
// ou toute autre URL de production réelle soumettrait de vrais visiteurs/
// admins à du bruit (rate-limit partagé, formulaires de contact factices
// dans "Messages reçus", webhooks WhatsApp simulés mélangés aux vrais) —
// ce n'est jamais approprié, y compris pour une "petite" campagne.
//
// Provisionnement multi-tenant :
//   Le palier "10/100 tenants" nécessite un fichier JSON listant les
//   tenants + comptes admin déjà créés (ce script ne crée aucun tenant —
//   la création de compte est elle-même rate-limitée et n'a pas sa place
//   dans une boucle de charge). Générer ce fichier au préalable, par ex. :
//     [
//       {"slug": "loadtest-01", "email": "admin@loadtest-01.test", "password": "..."},
//       {"slug": "loadtest-02", "email": "admin@loadtest-02.test", "password": "..."}
//     ]
//   Voir scripts/seed-load-test-tenants.md (à écrire par l'opérateur selon
//   l'environnement cible) pour un exemple de script de provisionnement.
//
// Usage :
//   k6 run \
//     --env BASE_URL=http://localhost:8000 \
//     --env FRONTEND_URL=http://localhost:3000 \
//     --env TENANTS_FILE=./load-tests/tenants.10.json \
//     --env TIER=10 \
//     load-tests/full-journey.js
//
//   TIER contrôle le profil de charge : 10 | 100 | 1000
//     10   → 10 tenants, jusqu'à ~25 VUs (une poignée d'écoles actives)
//     100  → 100 tenants, jusqu'à ~250 VUs (déploiement régional)
//     1000 → jusqu'à 1000 VUs simulés (répartis sur les tenants du fichier
//            fourni — prévoir un TENANTS_FILE avec suffisamment d'entrées
//            pour ne pas concentrer toute la charge sur un seul tenant)
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const API = `${BASE_URL}/api/v1`;
const TIER = __ENV.TIER || '10';

const tenants = new SharedArray('tenants', function () {
  const path = __ENV.TENANTS_FILE;
  if (!path) {
    throw new Error(
      'TENANTS_FILE is required — a JSON array of {slug, email, password}. ' +
      'See the header comment in this file for the expected shape and how ' +
      'to provision synthetic tenants before running this scenario.'
    );
  }
  return JSON.parse(open(path));
});

// Per-flow latency, so a slow step (e.g. imports) doesn't get averaged
// away by fast read paths in the aggregate http_req_duration.
const dashboardTrend = new Trend('flow_dashboard_ms');
const publicPagesTrend = new Trend('flow_public_pages_ms');
const contactFormTrend = new Trend('flow_contact_form_ms');
const importsTrend = new Trend('flow_imports_ms');
const paymentsTrend = new Trend('flow_payments_ms');
const whatsappTrend = new Trend('flow_whatsapp_webhook_ms');
const offlineSyncTrend = new Trend('flow_offline_sync_burst_ms');

const TIER_STAGES = {
  '10': [
    { duration: '30s', target: 10 },
    { duration: '2m', target: 25 },
    { duration: '30s', target: 0 },
  ],
  '100': [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 250 },
    { duration: '1m', target: 0 },
  ],
  '1000': [
    { duration: '2m', target: 200 },
    { duration: '3m', target: 600 },
    { duration: '3m', target: 1000 },
    { duration: '2m', target: 0 },
  ],
};

export const options = {
  stages: TIER_STAGES[TIER] || TIER_STAGES['10'],
  thresholds: {
    // Aggregate — kept loose on purpose; the per-flow Trends above are
    // where a real regression should actually be diagnosed.
    http_req_duration: ['p(95)<800', 'p(99)<2500'],
    http_req_failed: ['rate<0.02'],
    checks: ['rate>0.98'],
    flow_dashboard_ms: ['p(95)<500'],
    flow_public_pages_ms: ['p(95)<400'],
    flow_contact_form_ms: ['p(95)<600'],
    flow_imports_ms: ['p(95)<1500'],
    flow_payments_ms: ['p(95)<800'],
    flow_whatsapp_webhook_ms: ['p(95)<500'],
    flow_offline_sync_burst_ms: ['p(95)<2000'],
  },
};

function pickTenant() {
  return tenants[Math.floor(Math.random() * tenants.length)];
}

export function setup() {
  // One login per tenant in setup(), not per-VU-iteration — auth is
  // rate-limited (5/minute per IP+tenant, see public_pages.py's own
  // limiter and auth.py's), and re-authenticating on every iteration
  // would exhaust that quota before the load profile even ramps up.
  const tokensBySlug = {};
  for (const t of tenants) {
    const res = http.post(`${API}/auth/login/`, {
      username: t.email,
      password: t.password,
    });
    if (res.status !== 200) {
      throw new Error(`login failed for tenant ${t.slug}: ${res.status} ${res.body}`);
    }
    tokensBySlug[t.slug] = res.json('access_token');
  }
  return { tokensBySlug };
}

export default function (data) {
  const tenant = pickTenant();
  const token = data.tokensBySlug[tenant.slug];
  const headers = { Authorization: `Bearer ${token}`, 'X-Tenant-ID': tenant.slug };

  group('dashboard', function () {
    const start = Date.now();
    const overview = http.get(`${API}/analytics/overview/`, { headers });
    const students = http.get(`${API}/students/?page=1&page_size=25`, { headers });
    const notifications = http.get(`${API}/notifications/`, { headers });
    dashboardTrend.add(Date.now() - start);
    check(overview, { 'dashboard: analytics 200': (r) => r.status === 200 });
    check(students, { 'dashboard: students 200': (r) => r.status === 200 });
    check(notifications, { 'dashboard: notifications 200': (r) => r.status === 200 });
  });

  group('public_pages', function () {
    // No auth — this is the anonymous-visitor path (Phase 1-5 hardening
    // target). Exercises the same nav/page endpoints a real prospective
    // parent hits before ever logging in.
    const start = Date.now();
    const nav = http.get(`${API}/tenants/public/${tenant.slug}/nav/`);
    publicPagesTrend.add(Date.now() - start);
    check(nav, { 'public nav 200': (r) => r.status === 200 });
    const navItems = nav.status === 200 ? nav.json() : [];
    if (navItems.length > 0) {
      const page = navItems[Math.floor(Math.random() * navItems.length)];
      const pageResp = http.get(`${API}/tenants/public/${tenant.slug}/pages/${page.slug}/`);
      check(pageResp, { 'public page 200': (r) => r.status === 200 });
    }
  });

  group('contact_form', function () {
    // Rate-limited 10/min per IP+tenant (see _submit_form_rate_key in
    // public_pages.py) — the sleep() at the end of the iteration is what
    // keeps this realistic rather than immediately tripping 429s for
    // every VU sharing a tenant.
    const start = Date.now();
    const resp = http.post(
      `${API}/tenants/public/${tenant.slug}/submit-form/`,
      JSON.stringify({
        name: `Charge Test VU${__VU}`,
        email: `loadtest-vu${__VU}-${__ITER}@example.com`,
        subject: 'Test de charge',
        message: `Message généré par le test de charge k6 (tier=${TIER}, iter=${__ITER}).`,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
    contactFormTrend.add(Date.now() - start);
    check(resp, {
      'contact form 201 or rate-limited 429': (r) => r.status === 201 || r.status === 429,
    });
  });

  group('imports_legers', function () {
    // Preview only (not confirm) — exercises CSV parsing/validation
    // without creating real student rows on every iteration, which would
    // make the target DB grow unboundedly over a long campaign.
    const start = Date.now();
    const csv = 'first_name,last_name,date_of_birth,gender\nCharge,Test,2015-01-01,MALE\n';
    const resp = http.post(
      `${API}/imports/students/preview/`,
      { file: http.file(csv, 'loadtest.csv', 'text/csv') },
      { headers },
    );
    importsTrend.add(Date.now() - start);
    check(resp, { 'import preview 200': (r) => r.status === 200 });
  });

  group('paiements', function () {
    const start = Date.now();
    // Payment *intent* creation (not a real charge) — exercises the
    // finance write path's validation/DB-write cost without moving real
    // money or depending on a configured Mobile Money provider.
    const resp = http.post(
      `${API}/payments/intent/`,
      JSON.stringify({ amount: 10000, description: `Test de charge VU${__VU}` }),
      { headers: { ...headers, 'Content-Type': 'application/json' } },
    );
    paymentsTrend.add(Date.now() - start);
    check(resp, {
      // 200/201 if the endpoint accepts it, 400/422 if this tenant has no
      // payment provider configured — both are "the request was handled",
      // only a 5xx or timeout is the failure this flow is watching for.
      'payment intent handled (not 5xx)': (r) => r.status < 500,
    });
  });

  group('whatsapp_simule', function () {
    // Same simulated-webhook approach as tests/e2e/pilot-journey.spec.ts
    // test 4 — a hand-built Meta-shaped payload posted directly, not a
    // real WhatsApp message. Exercises persistence + inbox visibility
    // cost, not Meta's own infrastructure.
    const start = Date.now();
    const resp = http.post(
      `${API}/whatsapp/webhook/`,
      JSON.stringify({
        entry: [{
          changes: [{
            value: {
              metadata: { phone_number_id: `loadtest-${tenant.slug}` },
              messages: [{
                id: `wamid.loadtest.${__VU}.${__ITER}.${Date.now()}`,
                from: `224${String(600000000 + __VU).slice(-9)}`,
                type: 'text',
                text: { body: 'Message de test de charge' },
              }],
            },
          }],
        }],
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
    whatsappTrend.add(Date.now() - start);
    check(resp, { 'whatsapp webhook handled (not 5xx)': (r) => r.status < 500 });
  });

  group('offline_sync_simule', function () {
    // Real offline sync is client-side (IndexedDB outbox — see
    // src/offline/), never a dedicated backend endpoint: a device that
    // was offline just replays its queued writes against normal endpoints
    // the moment connectivity returns. This models that "reconnect burst"
    // — several attendance check-ins fired back-to-back, no think time —
    // rather than one write every few seconds like the rest of this script.
    const start = Date.now();
    for (let i = 0; i < 5; i++) {
      const resp = http.post(
        `${API}/school-life/check-ins/`,
        JSON.stringify({
          check_in_type: 'ARRIVAL',
          method: 'MANUAL',
          notes: `Rafale de synchro hors-ligne — élément ${i + 1}/5`,
        }),
        { headers: { ...headers, 'Content-Type': 'application/json' } },
      );
      check(resp, { 'offline sync item handled (not 5xx)': (r) => r.status < 500 });
    }
    offlineSyncTrend.add(Date.now() - start);
  });

  sleep(Math.random() * 3 + 1); // 1-4 s think time between iterations
}
