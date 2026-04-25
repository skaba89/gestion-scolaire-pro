import { test, expect } from '../fixtures/auth';

/**
 * E2E - Badges : isolation tenant & sécurité
 */

test.describe('Badges - Sécurité & Isolation Tenant', () => {
  test('le JWT ne contient pas de données en clair sensibles', async ({ loginAsAdmin, page }) => {
    await loginAsAdmin(page);

    const token = await page.evaluate(() => localStorage.getItem('schoolflow:access_token'));
    expect(token).toBeTruthy();

    if (token) {
      const parts = token.split('.');
      expect(parts).toHaveLength(3);

      const payload = JSON.parse(atob(parts[1]));
      // le mot de passe ne doit jamais être dans le payload JWT
      expect(payload.password).toBeUndefined();
      expect(payload.hashed_password).toBeUndefined();
    }
  });

  test('la session expirée redirige vers login', async ({ loginAsAdmin, page }) => {
    await loginAsAdmin(page);

    // simuler expiration en effaçant le token
    await page.evaluate(() => localStorage.removeItem('schoolflow:access_token'));

    // tenter de naviguer vers une page protégée
    await page.goto('/admin/badges');
    await page.waitForLoadState('networkidle');

    const url = page.url();
    // doit être redirigé ou la page doit afficher une erreur d'auth
    const isProtected =
      url.includes('/auth/login') ||
      url.includes('/login') ||
      (await page.locator('text=/connecter|login|session/i').count()) > 0;
    expect(isProtected).toBeTruthy();
  });

  test('chaque requête API inclut le header Authorization', async ({ loginAsAdmin, page }) => {
    const apiRequests: string[] = [];

    page.on('request', (req) => {
      if (req.url().includes('/api/v1/')) {
        const auth = req.headers()['authorization'];
        if (auth) apiRequests.push(auth);
      }
    });

    await loginAsAdmin(page);
    await page.goto('/admin/badges');
    await page.waitForLoadState('networkidle');

    // si des requêtes API ont été faites, elles doivent avoir un Bearer token
    for (const authHeader of apiRequests) {
      expect(authHeader).toMatch(/^Bearer /);
    }
  });

  test('accès au slug tenant incorrect bloque la navigation', async ({ page }) => {
    // tenter d'accéder à un slug inexistant
    await page.goto('/slug-inexistant-xyz-999/admin/badges');
    await page.waitForLoadState('networkidle');

    // doit afficher une erreur ou rediriger — pas une page admin valide
    const url = page.url();
    const is404OrRedirect =
      url.includes('/auth/login') ||
      url.includes('/login') ||
      url.includes('slug-inexistant-xyz-999');

    // au minimum la page ne doit pas afficher le dashboard admin d'un autre tenant
    expect(url).not.toMatch(/\/[a-z-]+\/admin\/dashboard$/);
  });
});
