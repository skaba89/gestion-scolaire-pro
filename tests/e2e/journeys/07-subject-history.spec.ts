import { expect, test } from '@playwright/test';
import { api, stateFile, ulsUrl } from './helpers';

test.use({ storageState: stateFile('admin') });

test('une matière notée reste intacte après un refus de suppression', async ({ page, request }) => {
  const admin = api(request, 'admin');
  const run = Date.now().toString(36);
  const name = `E2E matière historique ${run}`;
  const created = await admin.post('/subjects/', { name, coefficient: 1 });
  expect(created.status()).toBe(201);
  const subject = await created.json();
  const assessed = await admin.post('/assessments/', {
    subject_id: subject.id, name: `Contrôle ${run}`, type: 'EXAM', date: '2026-11-01', max_score: 20,
  });
  expect(assessed.ok()).toBeTruthy();
  const assessment = await assessed.json();
  const enrolled = await admin.post('/students/', {
    first_name: 'Mariama', last_name: 'Historique', registration_number: `E2E-SUBJECT-${run}`,
    date_of_birth: '2005-01-09', gender: 'FEMALE',
  });
  expect(enrolled.status()).toBe(201);
  const student = await enrolled.json();
  const marked = await admin.post('/grades/', {
    student_id: student.id, subject_id: subject.id, assessment_id: assessment.id, score: 17, max_score: 20,
  });
  expect(marked.status()).toBe(201);
  const grade = await marked.json();

  await page.goto(ulsUrl('/admin/subjects'));
  await page.getByPlaceholder('Nom ou code de la matière...').fill(name);
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toBeVisible();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.once('dialog', dialog => dialog.accept());
  const refused = page.waitForResponse(r => r.url().endsWith(`/subjects/${subject.id}/`) && r.request().method() === 'DELETE');
  await row.getByRole('button', { name: 'Supprimer la matière' }).click();
  expect((await refused).status()).toBe(409);
  // Toast has both a visible description and an aria-live announcement.
  // Scope the assertion to the notification content to avoid strict-mode ambiguity.
  await expect(page.getByLabel('Notifications (F8)').getByText(/Cette matière est utilisée/).first()).toBeVisible();
  await expect(row).toBeVisible();
  const saved = await admin.get(`/subjects/${subject.id}/`);
  expect(saved.status()).toBe(200);
  const result = await admin.get(`/grades/${grade.id}/`);
  expect(result.status()).toBe(200);
  expect(await result.json()).toEqual(expect.objectContaining({
    score: 17, subject_id: subject.id, assessment_id: assessment.id,
  }));
  expect(errors).toEqual([]);
});
