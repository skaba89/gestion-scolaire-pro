import { expect, test } from '@playwright/test';
import { api, stateFile, ulsUrl } from './helpers';

type TeachingUnit = {
  id: string;
  revision: number;
  code: string;
  is_active: boolean;
  subject_count: number;
  assigned_ects: number;
};

test.describe('LMD — unités d’enseignement et ECUE', () => {
  test.use({ storageState: stateFile('admin') });

  test('crée une UE, rattache un ECUE et archive sans perdre l’historique', async ({ page, request }) => {
    test.setTimeout(120_000);
    const admin = api(request, 'admin');
    const otherTenant = api(request, 'witness');
    const suffix = Date.now().toString(36).toUpperCase();
    const code = `UE-E2E-${suffix}`;
    const name = `Unité E2E ${suffix}`;
    const subjectName = `ECUE E2E ${suffix}`;
    const semestersResponse = await admin.get('/semesters/');
    expect(semestersResponse.status()).toBe(200);
    const semesters = await semestersResponse.json();
    expect(semesters.length).toBeGreaterThan(0);
    const semester = semesters[0];
    let unit: TeachingUnit | undefined;
    let subjectId: string | undefined;

    try {
      await page.goto(ulsUrl('/admin/teaching-units'));
      await page.getByRole('button', { name: 'Nouvelle UE' }).click();
      await page.getByLabel('Semestre').click();
      await page.getByRole('option', { name: semester.name, exact: true }).click();
      await page.getByLabel('Code').fill(code);
      await page.getByLabel('Crédits ECTS').fill('6');
      await page.getByLabel('Nom').fill(name);
      const created = page.waitForResponse(response =>
        response.url().endsWith('/teaching-units/') && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Créer', exact: true }).click();
      expect((await created).status()).toBe(201);
      await expect(page.getByText(`${code} — ${name}`, { exact: true })).toBeVisible();

      unit = (await (await admin.get('/teaching-units/')).json())
        .find((item: TeachingUnit) => item.code === code);
      expect(unit).toBeTruthy();

      const otherList = await otherTenant.get('/teaching-units/');
      if (otherList.status() === 200) {
        expect((await otherList.json()).some((item: TeachingUnit) => item.id === unit!.id)).toBe(false);
      } else {
        expect(otherList.status()).toBe(403);
      }
      expect([403, 404]).toContain((await otherTenant.patch(`/teaching-units/${unit!.id}/`, {
        expected_revision: unit!.revision,
        name: 'Modification inter-établissement interdite',
      })).status());

      const subjectResponse = await admin.post('/subjects/', {
        name: subjectName,
        code: `EC-${suffix}`,
        coefficient: 1,
        ects: 6,
        semester_id: semester.id,
        teaching_unit_id: unit!.id,
      });
      expect(subjectResponse.status(), await subjectResponse.text()).toBe(201);
      subjectId = (await subjectResponse.json()).id;

      await page.reload({ waitUntil: 'domcontentloaded' });
      const card = page.getByText(`${code} — ${name}`, { exact: true })
        .locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');
      await expect(card.getByText('1 ECUE · 6 ECTS affectés', { exact: true })).toBeVisible();
      await expect(card.getByText('Crédits cohérents', { exact: true })).toBeVisible();

      await card.getByRole('button', { name: `Modifier ${code}` }).click();
      await page.getByLabel('UE active').click();
      const archived = page.waitForResponse(response =>
        response.url().endsWith(`/teaching-units/${unit!.id}/`) && response.request().method() === 'PATCH');
      await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
      expect((await archived).status()).toBe(200);

      const linkedSubject = await (await admin.get(`/subjects/${subjectId}/`)).json();
      expect(linkedSubject.teaching_unit_id).toBe(unit!.id);
      unit = (await (await admin.get('/teaching-units/')).json())
        .find((item: TeachingUnit) => item.id === unit!.id);
      expect(unit!.is_active).toBe(false);
      expect(unit!.subject_count).toBe(1);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload({ waitUntil: 'domcontentloaded' });
      const mobileCard = page.getByText(`${code} — ${name}`, { exact: true })
        .locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');
      await expect(mobileCard).toBeVisible();
      await expect(mobileCard.getByText('Archivée — historique conservé', { exact: true })).toBeVisible();
    } finally {
      if (subjectId) await admin.delete(`/subjects/${subjectId}/`);
      if (unit) {
        const current = (await (await admin.get('/teaching-units/')).json())
          .find((item: TeachingUnit) => item.id === unit!.id);
        if (current?.is_active) {
          await admin.patch(`/teaching-units/${unit.id}/`, {
            expected_revision: current.revision,
            is_active: false,
          });
        }
      }
    }
  });
});
