import { expect, test } from '@playwright/test';
import { API, api, tokenOf } from './helpers';

/**
 * Concurrency regression on the real PostgreSQL stack (NOBYPASSRLS role).
 *
 * Two endpoints trying to enroll the same pupil in the same school year
 * must serialize on the student's row lock. Exactly one request may create
 * the ACTIVE enrollment, and the final class roster must contain one row.
 */
test('parallel enrollment API requests create exactly one active enrollment', async ({ request }) => {
  const admin = api(request, 'admin');

  const [classResponse, yearResponse] = await Promise.all([
    admin.get('/infrastructure/classrooms/'),
    admin.get('/academic-years/'),
  ]);
  expect(classResponse.status()).toBe(200);
  expect(yearResponse.status()).toBe(200);

  const classes = await classResponse.json() as Array<{
    id: string; academic_year_id?: string | null;
  }>;
  const years = await yearResponse.json() as Array<{ id: string }>;
  const classroom = classes.find(c => c.academic_year_id && years.some(y => y.id === c.academic_year_id));
  expect(classroom, 'Need a class with an existing academic year').toBeDefined();
  const classId = classroom!.id;
  const yearId = classroom!.academic_year_id!;

  const matricule = `E2E-RACE-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const created = await admin.post('/students/', {
    first_name: 'Audit', last_name: 'Concurrence',
    date_of_birth: '2006-04-15', gender: 'FEMALE',
    registration_number: matricule,
  });
  expect(created.status()).toBe(201);
  const pupil = await created.json() as { id: string };

  const payload = {
    student_id: pupil.id, class_id: classId, academic_year_id: yearId,
  };
  // Launch both API routes in the same turn to detect read/check/write races.
  const attempts = await Promise.all([
    request.post(`${API}/enrollments/`, {
      headers: { Authorization: `Bearer ${tokenOf('admin')}` }, data: payload,
    }),
    request.post(`${API}/infrastructure/enrollments/`, {
      headers: { Authorization: `Bearer ${tokenOf('admin')}` }, data: payload,
    }),
  ]);
  const statuses = attempts.map(r => r.status());
  // Both enrollment routes may legitimately use either 200 or 201 on
  // creation. The contract is ONE success and ONE conflict, not a specific
  // success status code.
  expect(statuses.filter(code => code === 200 || code === 201),
    'Exactly one enrollment request must succeed').toHaveLength(1);
  expect(statuses.filter(code => code === 409),
    'The competing request must be rejected as a duplicate').toHaveLength(1);

  const rosterResponse = await admin.get(`/enrollments/?class_id=${classId}`);
  expect(rosterResponse.status()).toBe(200);
  const roster = await rosterResponse.json() as Array<{
    student_id: string; academic_year_id: string; status: string;
  }>;
  const activeMatches = roster.filter(e =>
    e.student_id === pupil.id &&
    e.academic_year_id === yearId &&
    e.status.toUpperCase() === 'ACTIVE'
  );
  expect(activeMatches).toHaveLength(1);
});
