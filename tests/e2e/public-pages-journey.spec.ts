import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Parcours pages publiques — E2E de bout en bout (Phase 4, brief
 * industrialisation formulaires/pages publiques).
 *
 * Couvre : connexion admin tenant, création d'une page depuis un modèle,
 * vérification qu'elle reste un brouillon (absente du menu public),
 * publication, apparition dans le menu public, ouverture de l'Aperçu,
 * remplissage du formulaire de contact réel, réception côté admin
 * ("Messages reçus"), marquage comme lu, dépublication, retrait du menu.
 *
 * Prérequis : stack Docker complète (postgres, redis, api, worker,
 * frontend) démarrée — `docker compose up -d`. Comme pilot-journey.spec.ts,
 * ce test n'est pas exécutable dans un environnement sans backend/DB réels
 * (ex. ce sandbox) — il est écrit et prêt pour la CI/l'exécution locale
 * avec la stack Docker.
 *
 * Setup (connexion, création de tenant/admin) fait via l'API pour rester
 * rapide et déterministe — même approche que pilot-journey.spec.ts. Les
 * étapes intrinsèquement UI (menu public, Aperçu, formulaire de contact,
 * "Messages reçus") passent par de vraies interactions navigateur.
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

test.describe.serial('Parcours pages publiques — bout en bout', () => {
  test.setTimeout(120_000);

  let tenantAdminToken: string;
  let tenantId: string;
  let tenantSlug: string;
  let tenantAdminEmail: string;
  let pageId: string;
  const pageSlug = `contact-e2e-${Date.now()}`;
  const tenantAdminPassword = 'PublicPagesE2E@2026!';

  // 1. Connexion admin tenant (création du tenant + admin via API, comme
  // pilot-journey.spec.ts, pour ne pas dépendre d'un envoi d'email réel).
  test('1. Login admin tenant', async ({ request, page }) => {
    const superAdminToken = await loginSuperAdmin(request);
    tenantSlug = `pubpages-e2e-${Date.now()}`;
    tenantAdminEmail = `admin.${Date.now()}@pubpages-e2e.gn`;

    const resp = await request.post(`${API_BASE}/tenants/`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
      data: { name: 'École Pages Publiques E2E', slug: tenantSlug, type: 'primary' },
    });
    expect(resp.ok(), `create_tenant failed: ${await resp.text()}`).toBeTruthy();
    tenantId = (await resp.json()).id;

    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);
    const hashResult = await execAsync(
      `docker exec gestion-scolaire-pro-api-1 python -c "from app.core.security import get_password_hash; print(get_password_hash('${tenantAdminPassword}'))"`,
    );
    const passwordHash = hashResult.stdout.trim().split('\n').pop();
    await execAsync(
      `docker exec gestion-scolaire-pro-api-1 python -c "` +
      `from app.core.database import SessionLocal; from app.models.user import User; from app.models.user_role import UserRole; from app.models.tenant import Tenant; from sqlalchemy.orm.attributes import flag_modified; import uuid; ` +
      `db = SessionLocal(); ` +
      `u = User(id=str(uuid.uuid4()), tenant_id='${tenantId}', email='${tenantAdminEmail}', username='${tenantAdminEmail}', first_name='Admin', last_name='E2E', password_hash='${passwordHash}', is_active=True, is_verified=True); ` +
      `db.add(u); db.flush(); db.add(UserRole(user_id=u.id, tenant_id='${tenantId}', role='TENANT_ADMIN')); ` +
      `t = db.query(Tenant).filter(Tenant.id == '${tenantId}').first(); ` +
      `t.settings = {**(t.settings or {}), 'onboarding_completed': True}; flag_modified(t, 'settings'); ` +
      `db.commit()"`,
    );

    await page.goto(`/${tenantSlug}/login`);
    await page.fill('input[type="email"]', tenantAdminEmail);
    await page.fill('input[type="password"]', tenantAdminPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(`**/${tenantSlug}/admin**`, { timeout: 15_000 });

    tenantAdminToken = await page.evaluate(() => localStorage.getItem('schoolflow:access_token')) as string;
    expect(tenantAdminToken).toBeTruthy();
  });

  // 2. Créer une page depuis un modèle (même payload que ce que
  // PublicPagesManager.tsx envoie quand l'admin choisit un modèle — un
  // contact_form est indispensable pour l'étape 6).
  test('2. Créer une page depuis un modèle', async ({ request }) => {
    const headers = { Authorization: `Bearer ${tenantAdminToken}`, 'X-Tenant-ID': tenantId };
    const resp = await request.post(`${API_BASE}/public-pages/`, {
      headers,
      data: {
        title: 'Contactez-nous',
        slug: pageSlug,
        page_type: 'CONTACT',
        template: 'default',
        is_published: false,
        show_in_nav: true,
        content: [
          { type: 'hero', title: 'Contactez-nous', subtitle: 'Nous sommes à votre écoute', settings: {} },
          {
            type: 'contact_form',
            title: 'Formulaire de contact',
            settings: { label: 'Contact' },
          },
        ],
      },
    });
    expect(resp.ok(), `create page from template failed: ${await resp.text()}`).toBeTruthy();
    const body = await resp.json();
    pageId = body.id;
    expect(body.is_published).toBe(false);
  });

  // 3. Vérifier que la page reste un brouillon — absente du menu public.
  test('3. La page en brouillon est absente du menu public', async ({ page, request }) => {
    const navResp = await request.get(`${API_BASE}/tenants/public/${tenantSlug}/nav/`);
    expect(navResp.ok()).toBeTruthy();
    const navItems = await navResp.json();
    expect(navItems.some((n: { slug: string }) => n.slug === pageSlug)).toBe(false);

    await page.goto(`/${tenantSlug}/pages/${pageSlug}`);
    // Une page non publiée ne doit jamais être servie publiquement, même
    // avec l'URL exacte.
    await expect(page.locator('body')).not.toContainText('Contactez-nous');
  });

  // 4. Publier la page.
  test('4. Publier la page', async ({ request }) => {
    const headers = { Authorization: `Bearer ${tenantAdminToken}`, 'X-Tenant-ID': tenantId };
    const resp = await request.patch(`${API_BASE}/public-pages/${pageId}/`, {
      headers,
      data: { is_published: true },
    });
    expect(resp.ok(), await resp.text()).toBeTruthy();
    expect((await resp.json()).is_published).toBe(true);
  });

  // 5. Vérifier l'apparition dans le menu public.
  test('5. La page publiée apparaît dans le menu public', async ({ request }) => {
    const navResp = await request.get(`${API_BASE}/tenants/public/${tenantSlug}/nav/`);
    expect(navResp.ok()).toBeTruthy();
    const navItems = await navResp.json();
    expect(navItems.some((n: { slug: string }) => n.slug === pageSlug)).toBe(true);
  });

  // 6. Ouvrir l'Aperçu (la vraie route publique) et remplir le formulaire
  // de contact réel — pas de simulation, le vrai composant ContactFormSection.
  test('6. Aperçu — remplir le formulaire de contact', async ({ page }) => {
    await page.goto(`/${tenantSlug}/pages/${pageSlug}`);
    await expect(page.getByText('Contactez-nous').first()).toBeVisible({ timeout: 10_000 });

    await page.fill('input[placeholder="Votre nom"]', 'Visiteur E2E');
    await page.fill('input[placeholder="votre@email.com"]', 'visiteur.e2e@example.com');
    await page.fill('input[placeholder="Sujet de votre message"]', 'Demande d\'information');
    await page.fill(
      'textarea[placeholder="Décrivez votre demande..."]',
      'Bonjour, ceci est un message envoyé depuis le test E2E des pages publiques.',
    );
    await page.click('button[type="submit"]:has-text("Envoyer le message")');

    await expect(page.getByText('Message envoyé')).toBeVisible({ timeout: 10_000 });
  });

  // 7. Vérifier que le message est reçu côté admin.
  test('7. Le message apparaît dans "Messages reçus" côté admin', async ({ page }) => {
    await page.goto(`/${tenantSlug}/login`);
    await page.evaluate(
      ({ token, tid }) => {
        localStorage.setItem('schoolflow:access_token', token);
        localStorage.setItem('last_tenant_id', tid);
      },
      { token: tenantAdminToken, tid: tenantId },
    );
    await page.goto(`/${tenantSlug}/admin/public-pages/messages`);
    await expect(page.getByText('visiteur.e2e@example.com')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Demande d'information")).toBeVisible();
  });

  // 8. Marquer le message comme lu.
  test('8. Marquer le message comme lu', async ({ page }) => {
    await page.click('button:has-text("Marquer comme lu")');
    await expect(page.getByText('Marquer comme lu')).toHaveCount(0, { timeout: 10_000 });
  });

  // 9. Dépublier la page.
  test('9. Dépublier la page', async ({ request }) => {
    const headers = { Authorization: `Bearer ${tenantAdminToken}`, 'X-Tenant-ID': tenantId };
    const resp = await request.patch(`${API_BASE}/public-pages/${pageId}/`, {
      headers,
      data: { is_published: false },
    });
    expect(resp.ok(), await resp.text()).toBeTruthy();
    expect((await resp.json()).is_published).toBe(false);
  });

  // 10. Vérifier le retrait du menu public.
  test('10. La page dépubliée est retirée du menu public', async ({ request }) => {
    const navResp = await request.get(`${API_BASE}/tenants/public/${tenantSlug}/nav/`);
    expect(navResp.ok()).toBeTruthy();
    const navItems = await navResp.json();
    expect(navItems.some((n: { slug: string }) => n.slug === pageSlug)).toBe(false);
  });

  // 11. La page dépubliée n'est plus servie publiquement (même URL directe).
  test('11. La page dépubliée n\'est plus accessible publiquement', async ({ page }) => {
    await page.goto(`/${tenantSlug}/pages/${pageSlug}`);
    await expect(page.locator('body')).not.toContainText('Formulaire de contact');
  });
});
