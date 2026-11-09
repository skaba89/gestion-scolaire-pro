import { expect, test, type APIRequestContext } from '@playwright/test';
import { api, stateFile, ulsUrl } from './helpers';

/**
 * Parcours 11 — pointage hors ligne puis retour du réseau (lot hors-ligne n°2).
 *
 * Réseau coupé dans le navigateur (`context.setOffline(true)`) : l'enseignant
 * pointe un absent, se ravise (présent puis absent à nouveau) ; rien n'atteint
 * le serveur. Au retour du réseau, la file se synchronise : le serveur garde
 * EXACTEMENT UNE présence, au dernier statut saisi — ni perte, ni doublon.
 *
 * Les vérifications passent par l'API côté test (`request`), dont le réseau
 * n'est pas coupé.
 */
const run = Date.now().toString(36).toUpperCase();
const matricule = `E2E-HL-${run}`;
/** Élève d'une AUTRE classe : ne doit jamais figurer dans la liste hors ligne
 * de « L1 Économie » (O6-A : l'ancien cache prenait les élèves de tout
 * l'établissement). */
const otherMatricule = `E2E-HL-AUTRE-${run}`;
const today = new Date().toISOString().slice(0, 10);

type Named = { id: string; name: string };
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
    first_name: 'Mariama', last_name: 'Bangoura', date_of_birth: '2005-03-14', gender: 'FEMALE',
    registration_number: matricule,
  });
  expect(student.status()).toBe(201);
  studentId = (await student.json()).id;
  const enrolled = await admin.post('/infrastructure/enrollments/', {
    student_id: studentId, class_id: classroom.id, academic_year_id: year.id,
  });
  expect(enrolled.ok()).toBeTruthy();

  const otherClass = ((await (await admin.get('/infrastructure/classrooms/')).json()) as (Named & { academic_year_id?: string })[])
    .find((c) => c.name !== 'L1 Économie' && c.academic_year_id === year.id)!;
  expect(otherClass, 'une autre classe de la même année').toBeTruthy();
  const other = await admin.post('/students/', {
    first_name: 'Ibrahima', last_name: 'Kaba', date_of_birth: '2005-07-02', gender: 'MALE',
    registration_number: otherMatricule,
  });
  expect(other.status()).toBe(201);
  const otherEnrolled = await admin.post('/infrastructure/enrollments/', {
    student_id: (await other.json()).id, class_id: otherClass.id, academic_year_id: year.id,
  });
  expect(otherEnrolled.ok()).toBeTruthy();
}

async function serverRecords(request: APIRequestContext): Promise<{ status: string }[]> {
  const resp = await api(request, 'admin').get(`/attendance/?student_id=${studentId}&date_from=${today}&date_to=${today}`);
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  return (body.items ?? body) as { status: string }[];
}

test.describe('Pointage hors ligne', () => {
  test.use({ storageState: stateFile('teacher') });

  test.beforeAll(async ({ request }) => {
    await prepare(request);
  });

  test('saisi sans réseau, envoyé une seule fois au retour, au dernier statut', async ({ page, context, request }) => {
    await page.goto(ulsUrl('/teacher/attendance'));
    await page.getByRole('combobox').filter({ hasText: 'Sélectionner une classe' }).click();
    await page.getByRole('option', { name: 'L1 Économie' }).click();
    // En ligne, la page met en cache la liste de la classe (pour le hors ligne).
    await expect(page.locator('tr').filter({ hasText: matricule })).toBeVisible();

    // Coupure : l'écran bascule sur la saisie hors ligne (OfflineAttendance).
    await context.setOffline(true);
    const row = page.getByText(matricule, { exact: true })
      .locator('xpath=ancestor::div[.//button[@title="Absent(e)"]][1]');
    await expect(row).toBeVisible({ timeout: 15_000 });
    // La liste hors ligne est celle de la classe, pas de l'établissement.
    await expect(page.getByText(otherMatricule, { exact: true })).toHaveCount(0);
    const save = page.getByRole('button', { name: 'Enregistrer hors-ligne' });

    await row.locator('button[title="Absent(e)"]').click();
    await save.click();
    // L'enseignant se ravise et réenregistre : seul le dernier statut compte.
    await row.locator('button[title="Présent(e)"]').click();
    await save.click();
    expect(await serverRecords(request)).toHaveLength(0); // rien n'est parti

    const synced = page.waitForResponse(
      (r) => r.url().endsWith('/attendance/') && r.request().method() === 'POST',
      { timeout: 30_000 },
    );
    await context.setOffline(false);
    expect((await synced).status()).toBe(201);

    await expect.poll(async () => (await serverRecords(request)).map((r) => r.status), { timeout: 15_000 })
      .toEqual(['PRESENT']);
    // Aucun second envoi différé (doublon) quelques secondes plus tard.
    await page.waitForTimeout(5_000);
    expect(await serverRecords(request)).toHaveLength(1);
  });
});
