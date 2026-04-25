import { test, expect } from '../fixtures/auth';

/**
 * E2E - Badges & Gamification : affichage UI
 */

test.describe('Badges - Affichage & UI', () => {
  test.beforeEach(async ({ loginAsAdmin, page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/badges');
    await page.waitForLoadState('networkidle');
  });

  test('la page badges se charge sans erreur console critique', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // filtrer les erreurs réseau attendues (API vide en test)
    const criticalErrors = errors.filter(
      (e) => !e.includes('net::ERR') && !e.includes('404') && !e.includes('401')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('la page affiche un titre lisible', async ({ page }) => {
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
    const text = await heading.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  });

  test('la page gamification se charge', async ({ page }) => {
    await page.goto('/admin/gamification');
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });

  test('la page gamification contient un leaderboard ou tableau', async ({ page }) => {
    await page.goto('/admin/gamification');
    await page.waitForLoadState('networkidle');

    // soit un tableau, soit un message vide, soit une liste
    const hasContent = await page.locator('table, [role="table"], ul li, [class*="leaderboard"], p').count();
    expect(hasContent).toBeGreaterThan(0);
  });

  test('pas de page blanche sur /admin/badges', async ({ page }) => {
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length).toBeGreaterThan(10);
  });
});
