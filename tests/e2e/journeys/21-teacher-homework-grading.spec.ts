import { expect, test } from '@playwright/test';
import { api, stateFile, ulsUrl } from './helpers';

test.use({ storageState: stateFile('teacher') });

test('un enseignant note un rendu de sa classe et retrouve la note et le commentaire', async ({ page, request }) => {
  const admin = api(request, 'admin');
  const teacher = api(request, 'teacher');
  const mark = Date.now().toString(36);
  const title = `Devoir de notation ${mark}`;
  const name = `Camara-${mark}`;
  const classes = await admin.get('/infrastructure/classrooms/');
  expect(classes.ok()).toBeTruthy();
  const classroom = (await classes.json()).find((c: { name: string }) => c.name === 'L1 Économie');
  const years = await admin.get('/academic-years/');
  const year = (await years.json()).find((y: { is_current: boolean }) => y.is_current);
  const users = await admin.get('/users/?search=prof.uls');
  const teacherId = (await users.json()).items[0].id;
  const assignments = await admin.get('/teachers/');
  if (!(await assignments.json()).items.some((a: { user_id: string; classroom_id: string }) =>
    a.user_id === teacherId && a.classroom_id === classroom.id)) {
    expect((await admin.post('/teachers/', { teacher_id: teacherId, class_id: classroom.id })).ok()).toBeTruthy();
  }
  const student = await admin.post('/students/', {
    first_name: 'Mariam', last_name: name, date_of_birth: '2005-03-12', gender: 'FEMALE',
    registration_number: `E2E-NOTE-${mark}`,
  });
  expect(student.status()).toBe(201);
  const studentId = (await student.json()).id;
  expect((await admin.post('/infrastructure/enrollments/', {
    student_id: studentId, class_id: classroom.id, academic_year_id: year.id,
  })).ok()).toBeTruthy();
  const created = await teacher.post('/homework/', {
    title, class_id: classroom.id, due_date: '2026-01-01', is_published: true,
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).id;
  expect((await admin.post(`/homework/${id}/submit/`, {
    homework_id: id, student_id: studentId, content: 'Réponse de recette.',
  })).status()).toBe(201);

  async function openGrading() {
    await page.goto(ulsUrl('/teacher/homework'));
    const card = page.getByText(title, { exact: true }).locator('xpath=ancestor::*[.//button][1]');
    await card.getByRole('button', { name: 'Voir', exact: true }).click();
    await page.getByRole('button', { name: 'Noter les rendus' }).click();
    return page.getByRole('row').filter({ hasText: name });
  }
  let row = await openGrading();
  await row.getByRole('spinbutton').fill('16.5');
  await row.getByRole('textbox').fill('Raisonnement précis');
  const saved = page.waitForResponse(r => r.request().method() === 'PUT' && r.url().includes('/homework-submissions/'));
  await row.getByRole('button', { name: 'Enregistrer' }).click();
  expect((await saved).status()).toBe(200);
  row = await openGrading();
  await expect(row.getByRole('spinbutton')).toHaveValue('16.5');
  await expect(row.getByRole('textbox')).toHaveValue('Raisonnement précis');
  const detail = await admin.get(`/homework/${id}/`);
  const stored = (await detail.json()).submissions.find((s: { student_id: string }) => s.student_id === studentId);
  expect(Number(stored.grade)).toBe(16.5);
  expect(stored.graded_by).toBe(teacherId);
});
