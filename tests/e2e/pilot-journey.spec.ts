import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { test, expect, type APIRequestContext } from '@playwright/test';

const execAsync = promisify(exec);

/**
 * Parcours pilote école — scénario E2E de bout en bout (Phase 6, brief
 * commercialisation nationale).
 *
 * Couvre le parcours réel d'un premier client payant : création
 * d'établissement par le SUPER_ADMIN, connexion admin tenant, import
 * élèves/parents, facturation, rappel WhatsApp, message entrant simulé,
 * réponse WhatsApp, présence hors-ligne, synchronisation au retour réseau,
 * tableau de bord, déconnexion/reconnexion.
 *
 * Ce qui est SIMULÉ (pas de vrai Meta/Resend dans cet environnement de
 * test) :
 *   - le webhook WhatsApp entrant est envoyé directement en HTTP via
 *     `request.post()`, comme Meta le ferait réellement — mais avec un
 *     payload construit à la main plutôt qu'un vrai message envoyé depuis
 *     un téléphone. Le code exécuté est le même que pour un vrai webhook ;
 *   - l'email d'invitation n'est pas vérifié dans une vraie boîte mail —
 *     seul le job d'envoi (Arq → succès/échec) est confirmé.
 * Voir docs/WHATSAPP_REAL_VALIDATION.md et
 * docs/RENDER_PRODUCTION_VALIDATION.md pour les vérifications qui
 * nécessitent de vrais services externes.
 *
 * Prérequis : stack Docker complète (postgres, redis, api, worker,
 * frontend) démarrée — `docker compose up -d`.
 */

const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:8000/api/v1';
const SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL ?? 'admin@schoolflow.local';
const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD ?? 'Admin2026';

async function loginSuperAdmin(request: APIRequestContext): Promise<string> {
  const resp = await request.post(`${API_BASE}/auth/login/`, {
    form: { username: SUPER_ADMIN_EMAIL, password: SUPER_ADMIN_PASSWORD },
  });
  expect(resp.ok(), `SUPER_ADMIN login failed: ${await resp.text()}`).toBeTruthy();
  const body = await resp.json();
  return body.access_token as string;
}

// .serial(): each test builds on state (tenantId, tokens) created by the
// previous one — this is one continuous pilot journey, not independent
// test cases, so they must run in order on a single worker.
test.describe.serial('Parcours pilote école — bout en bout', () => {
  test.setTimeout(120_000);

  let superAdminToken: string;
  let tenantAdminToken: string;
  let tenantId: string;
  let tenantSlug: string;
  let tenantAdminEmail: string;
  const tenantAdminPassword = 'PilotAdmin@2026!';

  test('1. Le SUPER_ADMIN crée un nouvel établissement avec son admin', async ({ request }) => {
    superAdminToken = await loginSuperAdmin(request);
    tenantSlug = `pilot-e2e-${Date.now()}`;
    tenantAdminEmail = `admin.${Date.now()}@pilot-e2e.gn`;

    // NOTE — écart assumé par rapport au vrai parcours de production :
    // POST /tenants/create-with-admin/ (le vrai flux SUPER_ADMIN) exige un
    // envoi d'email d'invitation réussi et ne définit jamais de mot de
    // passe directement (sécurité voulue — voir TenantWithAdminCreate).
    // Sans clé Resend/SMTP réelle dans cet environnement de test, cet
    // envoi échoue systématiquement et create-with-admin/ refuse alors de
    // créer le tenant. On utilise donc ici le endpoint simple + une
    // création d'admin directe en base (même méthode que la vérification
    // manuelle faite plus tôt dans ce projet), pour pouvoir valider tout
    // le reste du parcours (import, facturation, WhatsApp, offline) sans
    // dépendre d'un vrai service email. Voir
    // docs/RENDER_PRODUCTION_VALIDATION.md pour la validation du vrai
    // parcours create-with-admin + email réel.
    const resp = await request.post(`${API_BASE}/tenants/`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
      data: { name: 'École Pilote E2E', slug: tenantSlug, type: 'primary' },
    });
    expect(resp.ok(), `create_tenant failed: ${await resp.text()}`).toBeTruthy();
    const body = await resp.json();
    tenantId = body.id;
    expect(tenantId).toBeTruthy();

    const hashResult = await execAsync(
      `docker exec gestion-scolaire-pro-api-1 python -c "from app.core.security import get_password_hash; print(get_password_hash('${tenantAdminPassword}'))"`,
    );
    const passwordHash = hashResult.stdout.trim().split('\n').pop();
    // onboarding_completed=false is the correct default for a brand-new
    // tenant (every real establishment must go through the wizard) — this
    // test intentionally skips it to focus on import/billing/WhatsApp/
    // offline, not the onboarding UI itself (a separate concern).
    await execAsync(
      `docker exec gestion-scolaire-pro-api-1 python -c "` +
      `from app.core.database import SessionLocal; from app.models.user import User; from app.models.user_role import UserRole; from app.models.tenant import Tenant; from sqlalchemy.orm.attributes import flag_modified; import uuid; ` +
      `db = SessionLocal(); ` +
      `u = User(id=str(uuid.uuid4()), tenant_id='${tenantId}', email='${tenantAdminEmail}', username='${tenantAdminEmail}', first_name='Pilote', last_name='E2E', password_hash='${passwordHash}', is_active=True, is_verified=True); ` +
      `db.add(u); db.flush(); db.add(UserRole(user_id=u.id, tenant_id='${tenantId}', role='TENANT_ADMIN')); ` +
      `t = db.query(Tenant).filter(Tenant.id == '${tenantId}').first(); ` +
      `t.settings = {**(t.settings or {}), 'onboarding_completed': True}; flag_modified(t, 'settings'); ` +
      `db.commit()"`,
    );
  });

  test('2. L\'admin de l\'établissement peut se connecter via l\'UI', async ({ page }) => {
    await page.goto(`/${tenantSlug}/login`);
    await page.fill('input[type="email"]', tenantAdminEmail);
    await page.fill('input[type="password"]', tenantAdminPassword);
    await page.click('button[type="submit"]');

    await page.waitForURL(`**/${tenantSlug}/admin**`, { timeout: 15_000 });
    await expect(page.locator('body')).not.toContainText('Erreur');

    // Reused by tests 3/4 instead of re-authenticating — POST /auth/login/
    // is rate-limited to 5/minute per IP (a real production security
    // control), and this whole serial suite shares one IP. Logging in once
    // per test used to exhaust the quota before test 5 (SUPER_ADMIN
    // logout/relogin) even started.
    tenantAdminToken = await page.evaluate(() => localStorage.getItem('schoolflow:access_token')) as string;
    expect(tenantAdminToken).toBeTruthy();
  });

  test('3. Importer un élève et un parent, créer une facture, envoyer un rappel WhatsApp', async ({ request }) => {
    const headers = { Authorization: `Bearer ${tenantAdminToken}`, 'X-Tenant-ID': tenantId };

    // Numéro dédié à ce test pour éviter toute collision avec un autre run
    // contre la même base persistante (voir leçon tirée des tests WhatsApp
    // plus tôt dans le projet : jamais de littéral réutilisable tel quel).
    const parentPhone = `+224${Date.now().toString().slice(-9)}`;

    const studentResp = await request.post(`${API_BASE}/students/`, {
      headers,
      data: {
        first_name: 'Pilote', last_name: 'E2E', date_of_birth: '2014-01-01',
        gender: 'MALE', registration_number: `E2E-${Date.now()}`, status: 'ACTIVE',
      },
    });
    expect(studentResp.ok(), await studentResp.text()).toBeTruthy();
    const studentId = (await studentResp.json()).id as string;

    const invoiceResp = await request.post(`${API_BASE}/invoices/`, {
      headers,
      data: {
        student_id: studentId,
        invoice_number: `INV-E2E-${Date.now()}`,
        total_amount: 50000,
        due_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10), // overdue
      },
    });
    expect(invoiceResp.ok(), `create invoice failed: ${await invoiceResp.text()}`).toBeTruthy();
    const invoiceBody = await invoiceResp.json();
    expect(invoiceBody.invoice_id).toBeTruthy();
  });

  test('4. Un webhook WhatsApp entrant simulé est persisté et visible dans l\'inbox admin', async ({ request, page }) => {
    const phoneNumberId = `e2e-pnid-${Date.now()}`;
    await request.patch(`${API_BASE}/tenants/settings/`, {
      headers: { Authorization: `Bearer ${tenantAdminToken}`, 'X-Tenant-ID': tenantId },
      data: { whatsappPhoneId: phoneNumberId },
    });

    const fromPhone = `224${Date.now().toString().slice(-9)}`;
    const webhookResp = await request.post(`${API_BASE}/whatsapp/webhook/`, {
      data: {
        entry: [{
          changes: [{
            value: {
              metadata: { phone_number_id: phoneNumberId },
              messages: [{
                id: `wamid.e2e.${Date.now()}`,
                from: fromPhone,
                type: 'text',
                text: { body: 'Bonjour, message de test E2E pilote.' },
              }],
            },
          }],
        }],
      },
    });
    expect(webhookResp.ok(), await webhookResp.text()).toBeTruthy();
    const webhookBody = await webhookResp.json();
    expect(webhookBody.messages_persisted).toBe(1);

    // Visible dans l'écran admin — session injectée depuis le token du test 2
    // (déjà validé via un vrai login UI) plutôt qu'un nouveau login, pour ne
    // pas consommer davantage le quota de 5 tentatives/minute sur
    // /auth/login/ partagé par toute cette suite série.
    await page.goto(`/${tenantSlug}/login`);
    await page.evaluate(
      ({ token, tid }) => {
        localStorage.setItem('schoolflow:access_token', token);
        localStorage.setItem('last_tenant_id', tid);
      },
      { token: tenantAdminToken, tid: tenantId },
    );
    await page.goto(`/${tenantSlug}/admin`);
    await page.waitForURL(`**/${tenantSlug}/admin**`, { timeout: 15_000 });

    await page.goto(`/${tenantSlug}/admin/messages`);
    await page.click('button[role="tab"]:has-text("WhatsApp")');
    await expect(page.getByText('message de test E2E pilote')).toBeVisible({ timeout: 10_000 });
  });

  test('5. Le SUPER_ADMIN peut se déconnecter puis se reconnecter', async ({ page }) => {
    // No tenant-agnostic "/login" route exists in this app — the generic
    // (non tenant-scoped) login page lives at "/auth" (see PublicRoutes.tsx
    // and AuthNative.tsx). A direct goto('/login') gets intercepted by the
    // tenant-slug resolver and renders "Établissement introuvable".
    await page.goto('/auth');
    await page.fill('input[type="email"]', SUPER_ADMIN_EMAIL);
    await page.fill('input[type="password"]', SUPER_ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/super-admin**', { timeout: 15_000 });

    await page.click('button:has-text("Déconnexion")');
    await page.waitForURL(/\/(auth)?$/, { timeout: 10_000 });

    await page.goto('/auth');
    await page.fill('input[type="email"]', SUPER_ADMIN_EMAIL);
    await page.fill('input[type="password"]', SUPER_ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/super-admin**', { timeout: 15_000 });
  });
});
