import { expect, test } from '@playwright/test';
import { api, stateFile, ulsUrl } from './helpers';

/**
 * Parcours 1 — l'administration inscrit un étudiant et l'affecte à sa classe.
 *
 * Données : structure Université La Source (classe « L1 Économie », année
 * 2024-2025) chargée par scripts/seed_universite_la_source.py.
 */
test.use({ storageState: stateFile('admin') });

const matricule = `E2E-ECO-${Date.now().toString(36).toUpperCase()}`;

test.describe.serial('Inscription et affectation d\'un étudiant', () => {
  test('l\'admin crée un étudiant par le formulaire', async ({ page }) => {
    await page.goto(ulsUrl('/admin/students'));
    await page.getByRole('button', { name: 'Ajouter un étudiant' }).first().click();

    const dialog = page.getByRole('dialog');
    await dialog.locator('input[name=first_name]').fill('Mariama');
    await dialog.locator('input[name=last_name]').fill('Diallo');
    await dialog.locator('input[name=date_of_birth]').fill('2005-03-14');
    await dialog.getByRole('combobox').filter({ hasText: 'Sélectionner le genre' }).click();
    await page.getByRole('option', { name: 'Féminin' }).click();
    await dialog.getByRole('tab', { name: 'Scolarité' }).click();
    await dialog.locator('input[name=registration_number]').fill(matricule);

    const created = page.waitForResponse((r) => r.url().endsWith('/students/') && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Créer l\'étudiant' }).click();
    expect((await created).status()).toBe(201);
    await expect(dialog).toBeHidden();

    await page.getByPlaceholder(/Rechercher par nom ou numéro/).fill(matricule);
    await expect(page.getByRole('gridcell', { name: matricule })).toBeVisible();
    // Bug corrigé : le genre s'affichait brut (« FEMALE »).
    await expect(page.getByRole('row').filter({ hasText: matricule })).toContainText('Féminin');
  });

  test('l\'admin l\'affecte à la classe « L1 Économie »', async ({ page }) => {
    await page.goto(ulsUrl('/admin/enrollments'));
    await page.getByRole('combobox').filter({ hasText: 'Sélectionner une classe' }).click();
    await page.getByRole('option', { name: 'L1 Économie' }).click();

    // La case elle-même doit fonctionner (bug corrigé : le clic remontait à
    // la ligne et annulait la sélection).
    const row = page.locator('div.cursor-pointer').filter({ hasText: matricule });
    await row.getByRole('checkbox').click();
    await expect(row.getByRole('checkbox')).toBeChecked();

    const enrolled = page.waitForResponse((r) => /\/enrollments/.test(r.url()) && r.request().method() === 'POST');
    await page.getByRole('button', { name: /Inscrire 1 .* dans L1 Économie/ }).click();
    expect((await enrolled).ok()).toBeTruthy();

    await expect(page.getByRole('heading', { name: /Inscrits - L1 Économie/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: matricule })).toBeVisible();
  });

  test('l\'API confirme l\'étudiant dans l\'établissement', async ({ request }) => {
    const resp = await api(request, 'admin').get(`/students/?search=${matricule}`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.items.map((s: { registration_number: string }) => s.registration_number)).toContain(matricule);
  });
});

