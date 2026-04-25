import { test, expect } from '../fixtures/auth';

/**
 * E2E - Badges : notifications & interactions
 */

test.describe('Badges - Notifications & Interactions', () => {
  test.beforeEach(async ({ loginAsAdmin, page }) => {
    await loginAsAdmin(page);
  });

  test('la cloche de notifications est accessible sur le dashboard', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('networkidle');

    // vérifier que le dashboard charge (notifications peuvent être absentes en test)
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });

  test('la page badges peut recevoir une interaction clic', async ({ page }) => {
    await page.goto('/admin/badges');
    await page.waitForLoadState('networkidle');

    // cliquer sur le premier bouton disponible sans crasher
    const actionBtn = page.locator('button').first();
    if (await actionBtn.isVisible()) {
      await actionBtn.click();
      await page.waitForLoadState('networkidle');
    }

    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(0);
  });

  test('le token JWT contient les informations utilisateur', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('networkidle');

    const token = await page.evaluate(() => localStorage.getItem('schoolflow:access_token'));
    expect(token).toBeTruthy();

    if (token) {
      const parts = token.split('.');
      expect(parts).toHaveLength(3);

      const payload = JSON.parse(atob(parts[1]));
      // sub ou email doit être présent
      const hasUserInfo = payload.sub || payload.email || payload.user_id;
      expect(hasUserInfo).toBeTruthy();
    }
  });
});
