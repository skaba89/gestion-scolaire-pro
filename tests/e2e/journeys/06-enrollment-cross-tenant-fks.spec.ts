import { expect, test } from '@playwright/test';
import { API, api, tokenOf } from './helpers';

/**
 * A trusted enrollment must never reference a student/class/year from
 * another school, even when both foreign keys are valid globally.
 * Run against the CI stack with PostgreSQL NOBYPASSRLS.
 */
test('both enrollment endpoints reject foreign school references without changing rosters', async ({ request }) => {
  const uls = api(request, 'admin');
  const witness = api(request, 'witness');

  const [studentsResponse, classroomsResponse, yearsResponse] = await Promise.all([
    uls.get('/students/?page_size=100'),
    uls.get('/infrastructure/classrooms/'),
    uls.get('/academic-years/'),
  ]);
  expect(studentsResponse.status()).toBe(200);
  expect(classroomsResponse.status()).toBe(200);
  expect(yearsResponse.status()).toBe(200);

  const students = (await studentsResponse.json()).items as Array<{ id: string }>;
  const classrooms = await classroomsResponse.json() as Array<{
    id: string; academic_year_id?: string | null;
  }>;
  const years = await yearsResponse.json() as Array<{ id: string }>;
  expect(students.length).toBeGreaterThan(0);
  expect(classrooms.length).toBeGreaterThan(0);
  expect(years.length).toBeGreaterThan(0);
  const classroom = classrooms.find(c => !!c.academic_year_id) ?? classrooms[0];
  const year = years.find(y => y.id === classroom.academic_year_id) ?? years[0];

  // Create a disposable student in the witness school to exercise a valid
  // foreign student ID rather than relying on a fake/missing UUID.
  const matricule = `E2E-XTEN-${Date.now().toString(36)}`;
  const created = await witness.post('/students/', {
    first_name: 'Test', last_name: 'Isolation', date_of_birth: '2006-04-15',
    gender: 'FEMALE', registration_number: matricule,
  });
  expect(created.status()).toBe(201);
  const witnessStudent = await created.json() as { id: string };

  const beforeResponse = await uls.get(`/enrollments/?class_id=${classroom.id}`);
  expect(beforeResponse.status()).toBe(200);
  const beforeIds = (await beforeResponse.json() as Array<{ id: string }>).map(e => e.id).sort();

  for (const endpoint of ['/enrollments/', '/infrastructure/enrollments/']) {
    // A valid witness student may not enroll in the ULS class.
    const foreignStudent = await request.post(`${API}${endpoint}`, {
      headers: { Authorization: `Bearer ${tokenOf('admin')}` },
      data: {
        student_id: witnessStudent.id,
        class_id: classroom.id,
        academic_year_id: year.id,
      },
    });
    expect(foreignStudent.status(), `${endpoint}: foreign student`).toBe(409);

    // The witness school cannot reference a legitimate ULS class/year.
    const foreignClass = await request.post(`${API}${endpoint}`, {
      headers: { Authorization: `Bearer ${tokenOf('witness')}` },
      data: {
        student_id: witnessStudent.id,
        class_id: classroom.id,
        academic_year_id: year.id,
      },
    });
    expect(foreignClass.status(), `${endpoint}: foreign class`).toBe(409);
  }

  const afterResponse = await uls.get(`/enrollments/?class_id=${classroom.id}`);
  expect(afterResponse.status()).toBe(200);
  const afterIds = (await afterResponse.json() as Array<{ id: string }>).map(e => e.id).sort();
  expect(afterIds).toEqual(beforeIds);

  const witnessEnrollments = await witness.get('/enrollments/');
  expect(witnessEnrollments.status()).toBe(200);
  expect((await witnessEnrollments.json() as Array<{ student_id: string }>)
    .filter(e => e.student_id === witnessStudent.id)).toEqual([]);
});
