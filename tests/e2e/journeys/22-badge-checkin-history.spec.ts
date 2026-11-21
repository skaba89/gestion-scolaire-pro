import { expect, test } from '@playwright/test';
import { api, stateFile, ulsUrl } from './helpers';

test.use({ storageState: stateFile('admin') });

test("l'historique Badges retrouve l'entrée et la sortie du jour par matricule", async ({ page, request }) => {
  const admin = api(request, 'admin');
  const mark = Date.now().toString(36);
  const registration = `E2E-BADGE-${mark}`;
  const student = await admin.post('/students/', {
    first_name: 'Aïcha', last_name: `Diallo-${mark}`, registration_number: registration,
    date_of_birth: '2006-03-12', gender: 'FEMALE',
  });
  expect(student.status()).toBe(201);
  const studentId = (await student.json()).id;
  const day = await page.evaluate(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return today.getTime();
  });
  for (const [offset, direction] of [[0, 'IN'], [3600000, 'OUT'], [-86400000, 'IN']] as const) {
    const response = await admin.post('/school-life/check-ins/', {
      student_id: studentId, direction, checked_at: new Date(day + offset).toISOString(), source: 'MANUAL',
    });
    expect(response.ok()).toBeTruthy();
  }
  await page.goto(ulsUrl('/admin/badges'));
  await page.getByRole('tab', { name: 'Historique Pointages' }).click();
  await page.getByPlaceholder('Rechercher par nom ou numéro...').fill(registration);
  const rows = page.getByRole('row').filter({ hasText: registration });
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Sortie');
  await expect(rows.nth(1)).toContainText('Entrée');
  await expect(rows.nth(1)).toContainText('MANUAL');
});
