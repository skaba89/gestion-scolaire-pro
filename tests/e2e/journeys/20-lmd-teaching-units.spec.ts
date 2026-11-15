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

type ValidationRules = {
  intra_ue_compensation_enabled: boolean;
  semester_compensation_enabled: boolean;
  semester_pass_grade: number;
  minimum_compensable_ue_grade: number;
  require_all_ecues_graded: boolean;
};

type ExamSession = {
  id: string;
  revision: number;
  code: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
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

  test('configure les compensations avec révision et restaure la règle initiale', async ({ page, request }) => {
    const admin = api(request, 'admin');
    const initialResponse = await admin.get('/teaching-units/validation-rules/');
    expect(initialResponse.status(), await initialResponse.text()).toBe(200);
    const initial: { revision: number; rules: ValidationRules } = await initialResponse.json();

    try {
      await page.goto(ulsUrl('/admin/teaching-units'));
      await expect(page.getByText('Règles de validation LMD', { exact: true })).toBeVisible();
      const toggle = page.getByLabel("Compensation au sein de l'UE");
      const before = await toggle.getAttribute('data-state');
      await toggle.click();
      const saved = page.waitForResponse(response =>
        response.url().endsWith('/teaching-units/validation-rules/') && response.request().method() === 'PUT');
      await page.getByRole('button', { name: 'Enregistrer les règles' }).click();
      expect((await saved).status()).toBe(200);

      const current = await (await admin.get('/teaching-units/validation-rules/')).json();
      expect(current.revision).toBe(initial.revision + 1);
      expect(current.rules.intra_ue_compensation_enabled).toBe(before !== 'checked');
    } finally {
      const currentResponse = await admin.get('/teaching-units/validation-rules/');
      if (currentResponse.status() === 200) {
        const current = await currentResponse.json();
        if (current.revision !== initial.revision) {
          const restored = await admin.put('/teaching-units/validation-rules/', {
            expected_revision: current.revision,
            rules: initial.rules,
          });
          expect(restored.status(), await restored.text()).toBe(200);
        }
      }
    }
  });

  test('crée, isole, ouvre puis clôture un rattrapage depuis l’administration', async ({ page, request }) => {
    test.setTimeout(120_000);
    const admin = api(request, 'admin');
    const otherTenant = api(request, 'witness');
    const semestersResponse = await admin.get('/semesters/');
    expect(semestersResponse.status()).toBe(200);
    const semesters = await semestersResponse.json();
    expect(semesters.length).toBeGreaterThan(0);
    const semester = semesters[0];
    const suffix = Date.now().toString(36).toUpperCase();
    const code = `RATT-E2E-${suffix}`;
    const name = `Rattrapage E2E ${suffix}`;

    await page.goto(ulsUrl('/admin/teaching-units'));
    await page.getByRole('button', { name: 'Nouvelle session' }).click();
    await page.getByLabel('Semestre').last().click();
    await page.getByRole('option', { name: semester.name, exact: true }).click();
    await page.getByLabel('Code').last().fill(code);
    await page.getByLabel('Nom').last().fill(name);
    await page.getByLabel('Type').click();
    await page.getByRole('option', { name: 'Rattrapage', exact: true }).click();
    await page.getByLabel('Règle de sélection').click();
    await page.getByRole('option', { name: 'Meilleure note', exact: true }).click();
    await page.getByLabel('Ordre').fill('2');
    await page.getByLabel('Début').fill('2027-02-10');
    await page.getByLabel('Fin').fill('2027-02-15');
    const createdResponse = page.waitForResponse(response =>
      response.url().endsWith('/exam-sessions/') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Créer la session' }).click();
    expect((await createdResponse).status()).toBe(201);
    await expect(page.getByText(`${code} — ${name}`, { exact: true })).toBeVisible();

    let session = (await (await admin.get('/exam-sessions/')).json())
      .find((item: ExamSession) => item.code === code) as ExamSession;
    expect(session.status).toBe('DRAFT');
    const otherList = await otherTenant.get('/exam-sessions/');
    if (otherList.status() === 200) {
      expect((await otherList.json()).some((item: ExamSession) => item.id === session.id)).toBe(false);
    } else {
      expect(otherList.status()).toBe(403);
    }
    expect([403, 404]).toContain((await otherTenant.patch(`/exam-sessions/${session.id}/`, {
      expected_revision: session.revision, status: 'OPEN',
    })).status());

    const row = page.getByText(`${code} — ${name}`, { exact: true }).locator('xpath=ancestor::div[contains(@class, "rounded-lg")][1]');
    const openedResponse = page.waitForResponse(response =>
      response.url().endsWith(`/exam-sessions/${session.id}/`) && response.request().method() === 'PATCH');
    await row.getByRole('button', { name: 'Ouvrir' }).click();
    expect((await openedResponse).status()).toBe(200);
    await expect(row.getByText('OPEN', { exact: true })).toBeVisible();

    session = (await (await admin.get('/exam-sessions/')).json())
      .find((item: ExamSession) => item.id === session.id);
    const closedResponse = page.waitForResponse(response =>
      response.url().endsWith(`/exam-sessions/${session.id}/`) && response.request().method() === 'PATCH');
    await row.getByRole('button', { name: 'Clôturer' }).click();
    expect((await closedResponse).status()).toBe(200);
    await expect(row.getByText('CLOSED', { exact: true })).toBeVisible();
    expect((await admin.delete(`/exam-sessions/${session.id}/`)).status()).toBe(405);
  });
});
