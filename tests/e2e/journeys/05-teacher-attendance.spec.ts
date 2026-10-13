import { expect, test, type APIRequestContext } from '@playwright/test';
import { api, stateFile, ulsUrl } from './helpers';

/**
 * Parcours 5 — l'enseignant pointe un étudiant absent, puis corrige en
 * présent ; l'API ne garde qu'UNE présence, au bon statut.
 *
 * Bug corrigé : l'écran enregistrait via POST /attendance/upsert/, route
 * inexistante (405) — chaque clic échouait.
 */
const run = Date.now().toString(36).toUpperCase();
const matricule = `E2E-PRES-${run}`;
const today = new Date().toISOString().slice(0, 10);

type Named = { id: string; name: string; code?: string };
let studentId = '';

async function prepare(request: APIRequestContext): Promise<void> {
  const admin = api(request, 'admin');
  const classroom = ((await (await admin.get('/infrastructure/classrooms/')).json()) as Named[])
    .find((c) => c.name === 'L1 Économie')!;
  const year = ((await (await admin.get('/academic-years/')).json()) as (Named & { is_current: boolean })[])
    .find((y) => y.is_current)!;
  const teacher = (await (await admin.get('/users/?search=prof.uls')).json()).items[0];
  const assignments = (await (await admin.get('/teachers/')).json()).items as { user_id: string; classroom_id: string }[];
  if (!assignments.some((a) => a.user_id === teacher.id && a.classroom_id === classroom.id)) {
    expect((await admin.post('/teachers/', { teacher_id: teacher.id, class_id: classroom.id })).status()).toBe(201);
  }
  const student = await admin.post('/students/', {
    first_name: 'Hawa', last_name: 'Conde', date_of_birth: '2004-12-25', gender: 'FEMALE',
    registration_number: matricule,
  });
  expect(student.status()).toBe(201);
  studentId = (await student.json()).id;
  const enrolled = await admin.post('/infrastructure/enrollments/', {
    student_id: studentId, class_id: classroom.id, academic_year_id: year.id,
  });
  expect(enrolled.ok()).toBeTruthy();
}

test.describe.serial('Pointage des présences par l\'enseignant', () => {
  test.beforeAll(async ({ request }) => {
    await prepare(request);
  });

  test.describe('côté enseignant', () => {
    test.use({ storageState: stateFile('teacher') });

    test('l\'enseignant pointe un absent puis corrige en présent', async ({ page }) => {
      await page.goto(ulsUrl('/teacher/attendance'));
      await page.getByRole('combobox').filter({ hasText: 'Sélectionner une classe' }).click();
      await page.getByRole('option', { name: 'L1 Économie' }).click();
      const row = page.locator('tr').filter({ hasText: matricule });

      const created = page.waitForResponse((r) => r.url().endsWith('/attendance/') && r.request().method() === 'POST');
      await row.getByRole('button', { name: 'Absent' }).click();
      expect((await created).status()).toBe(201);
      await expect(row.getByRole('button', { name: 'Absent' })).toHaveAttribute('aria-pressed', 'true');

      const corrected = page.waitForResponse((r) => /\/attendance\/[0-9a-f-]+\/$/.test(r.url()) && r.request().method() === 'PATCH');
      await row.getByRole('button', { name: 'Présent' }).click();
      expect((await corrected).status()).toBe(200);
      await expect(row.getByRole('button', { name: 'Présent' })).toHaveAttribute('aria-pressed', 'true');
    });
  });

  test.describe('côté administration', () => {
    test.use({ storageState: stateFile('admin') });

    test('une seule présence est enregistrée, au statut corrigé', async ({ request }) => {
      const resp = await api(request, 'admin').get(`/attendance/?student_id=${studentId}&date_from=${today}&date_to=${today}`);
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      const records = (body.items ?? body) as { status: string }[];
      expect(records).toHaveLength(1);
      expect(records[0].status).toBe('PRESENT');
    });
  });
});
