import { expect, test } from '@playwright/test';
import { api, credentials, stateFile } from './helpers';

test.describe('Cycles pédagogiques — établissement mixte et mobile', () => {
  test.use({ storageState: stateFile('witness') });

  test('crée, affecte et archive un cycle sans fuite inter-tenant', async ({ page, request }) => {
    test.setTimeout(120_000);
    const admin = api(request, 'witness');
    const other = api(request, 'admin');
    const suffix = Date.now().toString(36).toUpperCase();
    const code = `E2E-${suffix}`;
    const name = `Cycle E2E ${suffix}`;
    const levelsResponse = await admin.get('/levels/');
    expect(levelsResponse.status()).toBe(200);
    const levels = await levelsResponse.json();
    expect(levels.length).toBeGreaterThan(0);
    const rulesBefore = await (await admin.get('/tenants/settings/academic-rules/')).json();
    const initialCycleRules = Object.fromEntries(rulesBefore.cycles.map((item: { cycle_id: string; rules: unknown }) => [item.cycle_id, item.rules]));
    const initialLevelRules = Object.fromEntries(rulesBefore.levels.map((item: { level_id: string; rules: unknown }) => [item.level_id, item.rules]));
    const base = `/${credentials().witness.slug}/admin`;
    let cycle: { id: string; revision: number; is_active: boolean; level_ids: string[] } | undefined;

    try {
      await page.goto(`${base}/settings`);
      await page.getByRole('tab', { name: 'Cycles pédagogiques' }).click();
      await page.getByLabel('Code').fill(code);
      await page.getByLabel('Nom').fill(name);
      const created = page.waitForResponse(response => response.url().endsWith('/education/cycles/') && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Créer le cycle' }).click();
      expect((await created).status()).toBe(201);
      await expect(page.getByRole('heading', { name })).toBeVisible();

      const cycles = await (await admin.get('/education/cycles/')).json();
      cycle = cycles.find((item: { code: string }) => item.code === code);
      expect(cycle).toBeTruthy();
      const otherCycles = await (await other.get('/education/cycles/')).json();
      expect(otherCycles.some((item: { id: string }) => item.id === cycle!.id)).toBe(false);
      expect((await other.put(`/education/cycles/${cycle!.id}/levels/`, {
        expected_revision: cycle!.revision, level_ids: [levels[0].id],
      })).status()).toBe(404);

      const cycleRules = {
        passing_grade: 12,
        mentions: [
          { label: 'Assez Bien', min: 13 }, { label: 'Bien', min: 15 },
          { label: 'Très Bien', min: 17 }, { label: 'Excellent', min: 19 },
        ],
      };
      const savedRules = await admin.put('/tenants/settings/academic-rules/', {
        default: rulesBefore.default,
        cycles: { ...initialCycleRules, [cycle!.id]: cycleRules },
        levels: initialLevelRules,
      });
      expect(savedRules.status()).toBe(200);
      await page.goto(`${base}/academic-rules`);
      await expect(page.locator(`[id="cycle-${cycle!.id}-passing"]`)).toHaveValue('12');
      await page.goto(`${base}/settings`);
      await page.getByRole('tab', { name: 'Cycles pédagogiques' }).click();

      const card = page.getByRole('heading', { name }).locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');
      await card.getByLabel(levels[0].name, { exact: true }).click();
      const assigned = page.waitForResponse(response => response.url().endsWith(`/education/cycles/${cycle!.id}/levels/`) && response.request().method() === 'PUT');
      await card.getByRole('button', { name: 'Enregistrer les niveaux' }).click();
      expect((await assigned).status()).toBe(200);
      cycle = (await (await admin.get('/education/cycles/')).json()).find((item: { id: string }) => item.id === cycle!.id);
      expect(cycle!.level_ids).toContain(levels[0].id);

      const archived = page.waitForResponse(response => response.url().endsWith(`/education/cycles/${cycle!.id}/`) && response.request().method() === 'PATCH');
      await card.getByRole('button', { name: 'Archiver' }).click();
      expect((await archived).status()).toBe(200);
      cycle = (await (await admin.get('/education/cycles/')).json()).find((item: { id: string }) => item.id === cycle!.id);
      expect(cycle!.is_active).toBe(false);
      expect(cycle!.level_ids).toContain(levels[0].id);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('tab', { name: 'Cycles pédagogiques' }).click();
      await expect(page.getByRole('heading', { name })).toBeVisible();
      await expect(card.getByText('Archivé', { exact: true })).toBeVisible();
    } finally {
      await admin.put('/tenants/settings/academic-rules/', {
        default: rulesBefore.default,
        cycles: initialCycleRules,
        levels: initialLevelRules,
      });
      if (cycle?.is_active) {
        await admin.patch(`/education/cycles/${cycle.id}/`, {
          expected_revision: cycle.revision, is_active: false,
        });
      }
    }
  });
});
