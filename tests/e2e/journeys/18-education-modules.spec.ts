import { expect, test } from '@playwright/test';
import { api, credentials, stateFile } from './helpers';

for (const mobile of [false, true]) {
  test.describe(`Modules pédagogiques — ${mobile ? 'mobile' : 'bureau'}`, () => {
    test.use({ storageState: stateFile('witness') });
    test('aperçu sans écriture, désactivation API et page directe, puis réactivation', async ({ page, request }) => {
      test.setTimeout(90_000);
      if (mobile) await page.setViewportSize({ width: 390, height: 844 });
      const admin = api(request, 'witness');
      const other = api(request, 'admin');
      const beforeResponse = await admin.get('/education/configuration/');
      expect(beforeResponse.status()).toBe(200);
      const before = await beforeResponse.json();
      const catalog = await (await admin.get('/education/catalog/')).json();
      const otherBefore = await (await other.get('/education/configuration/')).json();
      const overrides = Object.fromEntries(catalog.modules.filter((m: { available: boolean; core: boolean }) => m.available && !m.core)
        .map((m: { id: string }) => [m.id, before.enabled_modules.includes(m.id)]));
      const base = `/${credentials().witness.slug}/admin`;
      try {
        await page.goto(`${base}/settings`);
        await page.getByRole('tab', { name: 'Modules pédagogiques' }).click();
        const library = page.getByRole('switch', { name: 'Bibliothèque', exact: true });
        await expect(library).toBeChecked();
        await expect(page.getByRole('switch', { name: 'Finances', exact: true })).toBeDisabled();
        await library.click();
        await expect(page.getByRole('button', { name: 'Appliquer cet aperçu' })).toBeDisabled();
        await page.getByRole('button', { name: 'Prévisualiser les changements' }).click();
        const apply = page.getByRole('button', { name: 'Appliquer cet aperçu' });
        await expect(apply).toBeEnabled();
        const previewOnly = await (await admin.get('/education/configuration/')).json();
        expect(previewOnly.revision).toBe(before.revision);
        expect((await admin.get('/library/resources/')).status()).toBe(200);
        const write = page.waitForResponse(r => r.url().endsWith('/education/configuration/') && r.request().method() === 'PUT');
        await apply.click();
        expect((await write).status()).toBe(200);
        expect((await admin.get('/library/resources/')).status()).toBe(403);
        expect((await admin.post('/library/resources/', { title: 'Interdit après désactivation' })).status()).toBe(403);
        await page.goto(`${base}/library`);
        await expect(page.getByRole('heading', { name: 'Module désactivé' })).toBeVisible();
        expect((await other.get('/library/resources/')).status()).toBe(200);
        expect((await (await other.get('/education/configuration/')).json()).revision).toBe(otherBefore.revision);
      } finally {
        const current = await (await admin.get('/education/configuration/')).json();
        const restored = await admin.put('/education/configuration/', {
          profile_id: before.profile_id, overrides, expected_revision: current.revision,
        });
        expect(restored.status(), await restored.text()).toBe(200);
      }
      expect((await admin.get('/library/resources/')).status()).toBe(200);
      await page.goto(`${base}/library`);
      await expect(page.getByRole('heading', { name: 'Module désactivé' })).toHaveCount(0);
    });
  });
}
