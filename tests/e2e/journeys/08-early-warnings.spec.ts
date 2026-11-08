import { expect, test } from '@playwright/test';
import { api, stateFile, ulsUrl } from './helpers';

/**
 * Navigation + genuine UI/browser workflow on CI's seeded PostgreSQL stack.
 * This fails if the page is removed from AdminRoutes or the sidebar,
 * even when the API itself remains healthy.
 */
test.describe.serial('Alertes précoces — direction scolaire', () => {
  test.use({ storageState: stateFile('admin') });

  test('le menu ouvre la page et une alerte peut être créée, prise en charge et résolue', async ({ page, request }) => {
    const marker = `E2E-ALERTE-${Date.now().toString(36)}`;
    const studentsResponse = await api(request, 'admin').get('/students/?page_size=10');
    expect(studentsResponse.status()).toBe(200);
    const students = await studentsResponse.json();
    expect(students.items.length).toBeGreaterThan(0);
    const student = students.items[0] as {
      id: string; first_name: string; last_name: string; registration_number: string;
    };

    await page.goto(ulsUrl('/admin'));
    // The student-life section is collapsed by default on desktop.
    await page.getByRole('button', { name: /Vie Étudiante|Vie scolaire/i }).click();
    const link = page.getByRole('link', { name: 'Alertes précoces' });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/admin\/early-warnings$/);
    await expect(page.getByRole('button', { name: 'Créer une alerte' })).toBeVisible();

    await page.getByRole('button', { name: 'Créer une alerte' }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('Élève concerné').fill(student.registration_number);
    await form.getByRole('button', { name: new RegExp(student.registration_number) }).click();
    await form.getByLabel('Titre').fill(marker);
    await form.getByLabel('Description').fill('Suivi individualisé requis');
    const created = page.waitForResponse(resp =>
      resp.url().endsWith('/school-life/early-warnings/') && resp.request().method() === 'POST'
    );
    await form.getByRole('button', { name: "Créer l'alerte" }).click();
    expect((await created).status()).toBe(201);
    await expect(form).toBeHidden();

    // Use the alert title to scope the mutation button to the correct card.
    const title = page.getByText(marker, { exact: true });
    await expect(title).toBeVisible();
    const card = title.locator('xpath=ancestor::*[contains(@class,"border")][1]');
    const acknowledged = page.waitForResponse(resp =>
      /\/school-life\/early-warnings\/[0-9a-f-]+\/$/.test(resp.url()) &&
      resp.request().method() === 'PUT'
    );
    await card.getByRole('button').first().click();
    expect((await acknowledged).status()).toBe(200);

    await page.getByRole('tab').nth(1).click();
    const processingTitle = page.getByText(marker, { exact: true });
    await expect(processingTitle).toBeVisible();
    const processingCard = processingTitle.locator('xpath=ancestor::*[contains(@class,"border")][1]');
    await processingCard.getByRole('button').click();
    const resolution = page.getByRole('dialog');
    const confirm = resolution.getByRole('button', { name: /confirmer|résoudre|terminer/i });
    await expect(confirm).toBeDisabled();
    await resolution.getByRole('textbox').fill('Entretien avec la famille réalisé');
    await expect(confirm).toBeEnabled();
    const resolved = page.waitForResponse(resp =>
      /\/school-life\/early-warnings\/[0-9a-f-]+\/$/.test(resp.url()) &&
      resp.request().method() === 'PUT'
    );
    await confirm.click();
    expect((await resolved).status()).toBe(200);
    const records = await api(request, 'admin').get('/school-life/early-warnings/');
    expect(records.status()).toBe(200);
    const persisted = (await records.json()).find((w: { title: string }) => w.title === marker);
    expect(persisted).toMatchObject({
      status: 'resolved', resolution_notes: 'Entretien avec la famille réalisé',
      student_id: student.id,
    });
  });
});

test.describe('Alertes précoces — contrôle des rôles', () => {
  test.use({ storageState: stateFile('teacher') });
  test("l'enseignant ne voit pas le lien de gestion des alertes", async ({ page, request }) => {
    await page.goto(ulsUrl('/teacher'));
    await expect(page.getByRole('link', { name: 'Alertes précoces' })).toHaveCount(0);
    const resp = await api(request, 'teacher').get('/school-life/early-warnings/');
    expect(resp.status()).toBe(403);
  });
});
