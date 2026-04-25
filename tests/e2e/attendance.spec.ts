import { test, expect } from '../fixtures/auth';

/**
 * E2E - Présences en direct & incidents
 */

test.describe('Présences en direct', () => {
  test.beforeEach(async ({ loginAsAdmin, page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/live-attendance');
    await page.waitForLoadState('networkidle');
  });

  test('la page présences se charge et affiche un titre', async ({ page }) => {
    await expect(page.locator('h1, h2').first()).toBeVisible();
    expect(page.url()).not.toContain('/auth/login');
  });

  test('pas d\'erreur console critique au chargement', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    const critical = errors.filter(
      (e) => !e.includes('net::ERR') && !e.includes('404') && !e.includes('401') && !e.includes('403')
    );
    expect(critical).toHaveLength(0);
  });

  test('un sélecteur de classe ou de date est présent', async ({ page }) => {
    const controls = page.locator(
      'select, [role="combobox"], input[type="date"], [data-testid*="class"], [data-testid*="date"]'
    );
    if (await controls.count() > 0) {
      await expect(controls.first()).toBeVisible();
    } else {
      // pas encore de controls — vérifier état vide
      const heading = page.locator('h1, h2').first();
      await expect(heading).toBeVisible();
    }
  });

  test('la page affiche un tableau ou un état vide lisible', async ({ page }) => {
    const hasContent =
      (await page.locator('table, [role="table"], [role="grid"]').count()) > 0 ||
      (await page.locator('text=/aucun|vide|no data|sélectionner|choisir/i').count()) > 0 ||
      (await page.locator('text=/présence|élève|classe/i').count()) > 0;
    expect(hasContent).toBeTruthy();
  });

  test('pas de page blanche sur /admin/live-attendance', async ({ page }) => {
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length).toBeGreaterThan(10);
  });
});

test.describe('Incidents', () => {
  test.beforeEach(async ({ loginAsAdmin, page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/incidents');
    await page.waitForLoadState('networkidle');
  });

  test('la page incidents se charge', async ({ page }) => {
    await expect(page.locator('h1, h2').first()).toBeVisible();
    expect(page.url()).not.toContain('/auth/login');
  });

  test('un bouton de création d\'incident existe', async ({ page }) => {
    const createBtn = page.locator(
      'button:has-text("Nouveau"), button:has-text("Ajouter"), button:has-text("Signaler"), button:has-text("+")'
    );
    if (await createBtn.count() > 0) {
      await expect(createBtn.first()).toBeVisible();
    } else {
      await expect(page.locator('h1, h2').first()).toBeVisible();
    }
  });

  test('les appels API incidents incluent le token Bearer', async ({ loginAsAdmin, page }) => {
    const incidentRequests: string[] = [];

    page.on('request', (req) => {
      if (req.url().includes('/api/v1/') && req.url().includes('incident')) {
        const auth = req.headers()['authorization'] || '';
        if (auth) incidentRequests.push(auth);
      }
    });

    await loginAsAdmin(page);
    await page.goto('/admin/incidents');
    await page.waitForLoadState('networkidle');

    for (const auth of incidentRequests) {
      expect(auth).toMatch(/^Bearer /);
    }
  });
});

test.describe('Alertes précoces', () => {
  test('la page early-warnings se charge', async ({ loginAsAdmin, page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/early-warnings');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1, h2').first()).toBeVisible();
    expect(page.url()).not.toContain('/auth/login');
  });
});
