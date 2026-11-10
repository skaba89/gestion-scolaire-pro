import { expect, test } from '@playwright/test';
import { api } from './helpers';

/**
 * Parcours 12 — de la candidature à l'inscription (B2).
 *
 * Candidature → soumise → en examen → acceptée → convertie en élève →
 * inscrite en « L1 Économie ». Régression ADM-CONVERT-01 : sur PostgreSQL,
 * chaque conversion échouait en 500 (INSERT sans `id`).
 *
 * Deux validations simultanées de la même candidature (double clic, deux
 * secrétaires) ne créent qu'UN élève.
 *
 * A3 : la conversion rattache le parent — compte en attente créé et lié à
 * l'élève (avant : coordonnées recopiées en texte, aucun lien).
 */
const run = Date.now().toString(36).toUpperCase();
type Named = { id: string; name: string };

test('une candidature acceptée devient un élève, une seule fois, puis est inscrite', async ({ request }) => {
  const admin = api(request, 'admin');
  const lastName = `Sylla-${run}`;

  const created = await admin.post('/admissions/', {
    student_first_name: 'Aminata', student_last_name: lastName, student_date_of_birth: '2006-02-11',
    student_gender: 'FEMALE', parent_first_name: 'Ousmane', parent_last_name: lastName,
    parent_email: `parent.${run.toLowerCase()}@example.com`, parent_phone: '+224621000000',
  });
  expect([200, 201]).toContain(created.status());
  const admission = (await created.json()) as { id: string };

  for (const status of ['SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED']) {
    const moved = await admin.patch(`/admissions/${admission.id}/status/`, { status });
    expect(moved.status(), `passage à ${status}`).toBe(200);
  }

  // Deux validations simultanées.
  const [a, b] = await Promise.all([
    admin.post(`/admissions/${admission.id}/convert/`, {}),
    admin.post(`/admissions/${admission.id}/convert/`, {}),
  ]);
  const statuses = [a.status(), b.status()].sort();
  expect(statuses, 'une conversion réussit, l\'autre est refusée').toEqual([200, 400]);
  const converted = (await (a.status() === 200 ? a : b).json()) as
    { student_id: string; registration_number: string; parent_link: { status: string } };
  expect(converted.registration_number).toMatch(/\S+/);
  expect(converted.parent_link).toEqual({ status: 'created' });
  const links = (await (await admin.get(`/student-parents/?student_id=${converted.student_id}`)).json()) as
    { parent?: { email?: string } }[];
  expect(links.map((l) => l.parent?.email)).toEqual([`parent.${run.toLowerCase()}@example.com`]);

  const students = (await (await admin.get(`/students/?search=${encodeURIComponent(lastName)}`)).json()).items as { id: string }[];
  expect(students.map((s) => s.id)).toEqual([converted.student_id]);

  const classroom = ((await (await admin.get('/infrastructure/classrooms/')).json()) as Named[])
    .find((c) => c.name === 'L1 Économie')!;
  const year = ((await (await admin.get('/academic-years/')).json()) as (Named & { is_current: boolean })[])
    .find((y) => y.is_current)!;
  const enrolled = await admin.post('/infrastructure/enrollments/', {
    student_id: converted.student_id, class_id: classroom.id, academic_year_id: year.id,
  });
  expect(enrolled.ok()).toBeTruthy();
  const roster = (await (await admin.get(`/infrastructure/enrollments/?class_id=${classroom.id}&status=active`)).json()) as
    { student_id: string }[];
  expect(roster.filter((e) => e.student_id === converted.student_id)).toHaveLength(1);
});

