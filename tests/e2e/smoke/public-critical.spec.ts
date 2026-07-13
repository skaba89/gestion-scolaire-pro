import { expect, test, type Page } from '@playwright/test';

const demoTenant = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Collège Pilote Conakry',
  slug: 'demo-school',
  type: 'COLLEGE',
  country: 'GN',
  currency: 'GNF',
  timezone: 'Africa/Conakry',
  is_active: true,
  settings: {
    primary_color: '#1e3a5f',
  },
  landing: {
    primary_color: '#1e3a5f',
    tagline: 'Réussir ensemble',
  },
  stats: {
    students_count: 120,
    teachers_count: 14,
  },
};

async function trackPageErrors(page: Page): Promise<Error[]> {
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  return errors;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

test('la vitrine guinéenne et ses actions principales sont accessibles', async ({ page }) => {
  const pageErrors = await trackPageErrors(page);
  const response = await page.goto('/');

  expect(response?.ok()).toBeTruthy();
  await expect(
    page.getByRole('heading', { name: /La gestion scolaire.*pour les établissements guinéens/i }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Créer mon établissement', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Se connecter', exact: true }).first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('les parcours publics essentiels rendent leurs formulaires', async ({ page }) => {
  const pageErrors = await trackPageErrors(page);

  await page.goto('/auth');
  await expect(page.getByRole('heading', { name: 'Connexion', exact: true })).toBeVisible();
  await expect(page.getByLabel('Adresse email')).toBeVisible();
  await expect(page.getByLabel('Mot de passe', { exact: true })).toBeVisible();

  await page.goto('/inscription');
  await expect(page.getByRole('heading', { name: 'Créer votre établissement' })).toBeVisible();
  await expect(page.getByLabel("Nom de l'établissement *")).toBeVisible();
  await expect(page.getByRole('button', { name: /Continuer/ })).toBeDisabled();

  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Politique de Confidentialité' })).toBeVisible();

  await page.goto('/terms');
  await expect(page.getByRole('heading', { name: "Conditions Générales d'Utilisation" })).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test('une route tenant protégée renvoie vers la connexion de cet établissement', async ({ page }) => {
  const pageErrors = await trackPageErrors(page);

  await page.route('**/api/v1/tenants/public/demo-school/', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(demoTenant) });
  });

  await page.goto('/demo-school/admin');
  await expect(page).toHaveURL(/\/demo-school\/auth$/);
  await expect(page.getByText('Collège Pilote Conakry').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
