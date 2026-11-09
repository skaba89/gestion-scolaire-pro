import { expect, test } from '@playwright/test';
import { API, api, credentials, tokenOf } from './helpers';

/**
 * Parcours 13 — réinscription, transfert de classe et changement d'année (B2).
 *
 * Régression RE-01 : valider une demande de RÉINSCRIPTION (formulaire public)
 * créait un second élève au lieu de rattacher la demande à l'élève existant.
 * Les parcours transfert et changement d'année, vérifiés sains, restent couverts.
 */
const run = Date.now().toString(36).toUpperCase();
type Named = { id: string; name: string; academic_year_id?: string };
type Year = Named & { is_current: boolean; end_date: string };

test('réinscription sans doublon, puis transfert de classe et inscription l\'année suivante', async ({ request }) => {
  const admin = api(request, 'admin');
  const tenantId = credentials().uls.id;
  const years = (await (await admin.get('/academic-years/')).json()) as Year[];
  const current = years.find((y) => y.is_current)!;
  const classes = ((await (await admin.get('/infrastructure/classrooms/')).json()) as Named[])
    .filter((c) => c.academic_year_id === current.id);
  const [classA, classB] = classes;
  expect(classB, 'deux classes dans l\'année en cours').toBeTruthy();
  const levelsBody = await (await admin.get('/levels/')).json();
  const level = ((levelsBody.items ?? levelsBody) as Named[])[0];

  // Élève existant, inscrit en classe A.
  const registration = `E2E-RE-${run}`;
  const parentEmail = `re.${run.toLowerCase()}@example.com`;
  const created = await admin.post('/students/', {
    first_name: 'Kadiatou', last_name: `Barry-${run}`, date_of_birth: '2007-06-15', gender: 'FEMALE',
    registration_number: registration, parent_email: parentEmail,
  });
  expect(created.status()).toBe(201);
  const studentId = (await created.json()).id as string;
  const enrolledA = await admin.post('/infrastructure/enrollments/', {
    student_id: studentId, class_id: classA.id, academic_year_id: current.id,
  });
  expect(enrolledA.ok()).toBeTruthy();
  const enrollmentA = (await enrolledA.json()).id as string;

  // Demande publique de réinscription (sans authentification).
  const reenroll = await request.post(`${API}/admissions/public/reenroll/`, {
    data: {
      tenant_id: tenantId, student_id: studentId, registration_number: registration,
      academic_year_id: current.id, level_id: level.id, parent_email: parentEmail,
    },
  });
  expect(reenroll.ok()).toBeTruthy();
  const reference = (await reenroll.json()).reference as string;
  for (const status of ['UNDER_REVIEW', 'ACCEPTED']) {
    expect((await admin.patch(`/admissions/${reference}/status/`, { status })).status()).toBe(200);
  }
  const validated = await admin.post(`/admissions/${reference}/convert/`, {});
  expect(validated.status()).toBe(200);
  const body = (await validated.json()) as { student_id: string; registration_number: string; reenrollment: boolean };
  expect(body).toMatchObject({ student_id: studentId, registration_number: registration, reenrollment: true });

  // Aucun doublon : un seul élève pour ce nom.
  const same = (await (await admin.get(`/students/?search=${encodeURIComponent(`Barry-${run}`)}`)).json()).items as { id: string }[];
  expect(same.map((s) => s.id)).toEqual([studentId]);

  // Transfert A → B : refusé tant que l'inscription A est active, accepté après retrait.
  const roster = async (classId: string) =>
    ((await (await admin.get(`/infrastructure/enrollments/?class_id=${classId}&status=active`)).json()) as { student_id: string }[])
      .filter((e) => e.student_id === studentId).length;
  const tooEarly = await admin.post('/infrastructure/enrollments/', {
    student_id: studentId, class_id: classB.id, academic_year_id: current.id,
  });
  expect(tooEarly.status()).toBe(409);
  const withdraw = await request.delete(`${API}/enrollments/${enrollmentA}/`, {
    headers: { Authorization: `Bearer ${tokenOf('admin')}` },
  });
  expect(withdraw.status()).toBe(204);
  expect((await admin.post('/infrastructure/enrollments/', {
    student_id: studentId, class_id: classB.id, academic_year_id: current.id,
  })).ok()).toBeTruthy();
  expect([await roster(classA.id), await roster(classB.id)]).toEqual([0, 1]);

  // Année suivante : nouvelle classe, inscription acceptée en plus de l'année en cours.
  const start = new Date(new Date(current.end_date).getTime() + 60 * 86_400_000);
  const nextYear = await admin.post('/academic-years/', {
    name: `Suivante ${run}`, code: `NX${run}`.slice(0, 20),
    start_date: start.toISOString().slice(0, 10),
    end_date: new Date(start.getTime() + 300 * 86_400_000).toISOString().slice(0, 10), is_current: false,
  });
  expect(nextYear.status()).toBe(201);
  const nextYearId = (await nextYear.json()).id as string;
  const nextClass = await admin.post('/infrastructure/classrooms/', { name: `Classe ${run}`, academic_year_id: nextYearId });
  expect(nextClass.ok()).toBeTruthy();
  const nextClassId = (await nextClass.json()).id as string;
  expect((await admin.post('/infrastructure/enrollments/', {
    student_id: studentId, class_id: nextClassId, academic_year_id: nextYearId,
  })).ok()).toBeTruthy();
  expect(await roster(nextClassId)).toBe(1);
});
