import { expect, test, type APIRequestContext } from '@playwright/test';
import { api, stateFile, ulsUrl } from './helpers';

/**
 * Parcours 3 — l'enseignant crée une évaluation, saisit une note ; l'admin
 * la retrouve et télécharge le bulletin PDF.
 *
 * Préparation par l'API (admin) : affectation de l'enseignant à
 * « L1 Économie » / ECO101, un étudiant inscrit dans cette classe.
 */
const run = Date.now().toString(36).toUpperCase();
const matricule = `E2E-NOTE-${run}`;
const assessmentName = `Partiel ECO101 ${run}`;
const SCORE = '15';

type Named = { id: string; name: string; code?: string };

async function prepare(request: APIRequestContext): Promise<void> {
  const admin = api(request, 'admin');
  const classroom = ((await (await admin.get('/infrastructure/classrooms/')).json()) as Named[])
    .find((c) => c.name === 'L1 Économie')!;
  const subject = ((await (await admin.get('/subjects/')).json()) as Named[]).find((s) => s.code === 'ECO101')!;
  const year = ((await (await admin.get('/academic-years/')).json()) as (Named & { is_current: boolean })[])
    .find((y) => y.is_current)!;
  const teacher = (await (await admin.get('/users/?search=prof.uls')).json()).items[0];

  const assignments = (await (await admin.get('/teachers/')).json()).items as
    { user_id: string; classroom_id: string; subject_id: string }[];
  if (!assignments.some((a) => a.user_id === teacher.id && a.classroom_id === classroom.id && a.subject_id === subject.id)) {
    const r = await admin.post('/teachers/', { teacher_id: teacher.id, class_id: classroom.id, subject_id: subject.id });
    expect(r.status()).toBe(201);
  }

  const student = await admin.post('/students/', {
    first_name: 'Alpha', last_name: 'Soumah', date_of_birth: '2005-01-09', gender: 'MALE',
    registration_number: matricule,
  });
  expect(student.status()).toBe(201);
  const enrolled = await admin.post('/infrastructure/enrollments/', {
    student_id: (await student.json()).id, class_id: classroom.id, academic_year_id: year.id,
  });
  expect(enrolled.ok()).toBeTruthy();
}

test.describe.serial('Notes et bulletin', () => {
  test.beforeAll(async ({ request }) => {
    await prepare(request);
  });

  test.describe('côté enseignant', () => {
    test.use({ storageState: stateFile('teacher') });

    test('l\'enseignant crée une évaluation et saisit une note', async ({ page }) => {
      await page.goto(ulsUrl('/teacher/grades'));
      await page.getByRole('combobox').filter({ hasText: 'Sélectionner une classe' }).click();
      await page.getByRole('option', { name: 'L1 Économie' }).click();

      // Création de l'évaluation (bug corrigé : 403 settings:write).
      await page.getByRole('button', { name: 'Nouvelle Évaluation', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByPlaceholder(/Ex: Devoir/).fill(assessmentName);
      const selects = dialog.getByRole('combobox');
      await selects.nth(0).click();
      await page.getByRole('option', { name: 'L1 Économie' }).click();
      await selects.nth(1).click();
      await page.getByRole('option', { name: 'Microéconomie I' }).click();
      await selects.nth(2).click();
      await page.getByRole('option', { name: 'Semestre 1' }).click();
      const created = page.waitForResponse((r) => r.url().endsWith('/assessments/') && r.request().method() === 'POST');
      await dialog.getByRole('button', { name: 'Créer l\'évaluation' }).click();
      expect((await created).status()).toBe(200);

      // L'évaluation apparaît (bug corrigé : class_id absent de la liste).
      await page.getByRole('combobox').filter({ hasText: 'Sélectionner une évaluation' }).click();
      await page.getByRole('option', { name: new RegExp(assessmentName) }).click();

      // Les étudiants de la classe se chargent (bug corrigé : 403 enrollments:read).
      const row = page.locator('main tr').filter({ hasText: matricule });
      await row.locator('input[type=number]').fill(SCORE);
      const saved = page.waitForResponse((r) => r.url().endsWith('/grades/') && r.request().method() === 'POST');
      await row.getByRole('button').last().click();
      expect((await saved).status()).toBe(201);
    });
  });

  test.describe('côté administration', () => {
    test.use({ storageState: stateFile('admin') });

    test('l\'admin voit la note dans les bulletins et télécharge le PDF', async ({ page }) => {
      await page.goto(ulsUrl('/admin/report-cards'));
      await expect(page.getByRole('combobox').filter({ hasText: 'Semestre 1' })).toBeVisible();
      const classSelect = page.getByRole('combobox').nth(1);
      if (!(await classSelect.innerText()).includes('L1 Économie')) {
        await classSelect.click();
        await page.getByRole('option', { name: 'L1 Économie' }).click();
      }

      const row = page.locator('tr').filter({ hasText: matricule });
      await expect(row).toContainText(`${Number(SCORE).toFixed(2)}/20`);

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        row.getByRole('button', { name: 'PDF', exact: true }).click(),
      ]);
      const body = await (await download.createReadStream()).toArray();
      const pdf = Buffer.concat(body);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(1000);
    });
  });
});
