import { expect, test } from '@playwright/test';
import { api, stateFile, ulsUrl } from './helpers';

/**
 * Parcours 4 — frais d'inscription → facture → paiement Mobile Money reçu
 * (référence Orange Money) → solde en espèces → facture payée.
 *
 * Mobile Money / moyens locaux uniquement (pas de carte bancaire). Le
 * paiement EN LIGNE par passerelle (CinetPay/PayTech) n'est pas joué ici :
 * il appelle l'API réelle du prestataire ; son rapprochement par webhook
 * signé est couvert par backend/tests/test_payment_webhook_events.py.
 */
test.use({ storageState: stateFile('admin') });

const run = Date.now().toString(36).toUpperCase();
const matricule = `E2E-FIN-${run}`;
const feeName = `Frais d'inscription ${run}`;
const omReference = `OM-${run}`;
// Transfert reçu la veille : la date saisie doit être conservée.
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

test.describe.serial('Frais, facture et paiement Mobile Money', () => {
  test.beforeAll(async ({ request }) => {
    const resp = await api(request, 'admin').post('/students/', {
      first_name: 'Kadiatou', last_name: 'Toure', date_of_birth: '2005-08-12', gender: 'FEMALE',
      registration_number: matricule,
    });
    expect(resp.status()).toBe(201);
  });

  test('l\'admin crée le frais d\'inscription', async ({ page }) => {
    await page.goto(ulsUrl('/admin/finances'));
    await page.getByRole('tab', { name: 'Frais' }).click();
    await page.getByRole('tabpanel').getByRole('button', { name: 'Ajouter un frais' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[name=name]').fill(feeName);
    await dialog.locator('input[name=amount]').fill('500000');
    const created = page.waitForResponse((r) => r.url().endsWith('/payments/fees/') && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    expect((await created).status()).toBe(201);

    // Bug corrigé : l'onglet affichait toujours « 0 » (réponse { items }).
    await expect(page.getByRole('tabpanel').getByText(feeName)).toBeVisible();
  });

  test('l\'admin facture l\'étudiant avec ce frais', async ({ page }) => {
    await page.goto(ulsUrl('/admin/finances'));
    await page.getByRole('tab', { name: 'Factures' }).click();
    await page.getByRole('tabpanel').getByRole('button', { name: 'Nouvelle Facture' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox').filter({ hasText: 'Sélectionner un étudiant' }).click();
    await page.getByRole('option', { name: new RegExp(matricule) }).click();
    await dialog.locator('input[name=due_date]').fill('2024-11-30');
    await dialog.getByRole('button', { name: 'Ajouter une ligne', exact: true }).click();
    // Bug corrigé : aucun frais n'était proposé ici.
    await dialog.getByRole('combobox').filter({ hasText: 'Choisir un frais existant' }).click();
    await page.getByRole('option', { name: new RegExp(feeName) }).click();

    const created = page.waitForResponse((r) => r.url().endsWith('/payments/invoices/') && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    expect((await created).status()).toBe(201);

    const row = page.locator('tr').filter({ hasText: matricule });
    await expect(row).toContainText('500 000');
    await expect(row).toContainText('En attente');
    // Bug corrigé : l'année figurait deux fois (INV-2026-2026-…).
    await expect(row).not.toContainText(/INV-\d{4}-\d{4}-/);
  });

  test('un transfert Mobile Money reçu puis un solde en espèces soldent la facture', async ({ page, request }) => {
    await page.goto(ulsUrl('/admin/finances'));
    await page.getByRole('tab', { name: 'Factures' }).click();
    const row = page.locator('tr').filter({ hasText: matricule });

    // 1. Mobile Money déjà reçu sur le numéro de l'établissement : enregistré
    //    directement (bug corrigé : l'écran lançait toujours la passerelle).
    await row.getByTitle('Enregistrer paiement').click();
    let dialog = page.getByRole('dialog');
    await dialog.locator('input[name=amount]').fill('200000');
    await dialog.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Mobile Money (reçu)' }).click();
    await dialog.locator('input[name=reference]').fill(omReference);
    await dialog.locator('input[name=payment_date]').fill(yesterday);
    let paid = page.waitForResponse((r) => r.url().endsWith('/payments/register/'));
    await dialog.getByRole('button', { name: 'Enregistrer le paiement' }).click();
    let resp = await paid;
    expect(resp.status()).toBe(201);
    expect((await resp.json()).status).toBe('PARTIAL');
    await expect(row).toContainText('Partiel');

    // 2. Le reste dû est proposé ; solde en espèces.
    await row.getByTitle('Enregistrer paiement').click();
    dialog = page.getByRole('dialog');
    await expect(dialog.locator('input[name=amount]')).toHaveValue('300000');
    paid = page.waitForResponse((r) => r.url().endsWith('/payments/register/'));
    await dialog.getByRole('button', { name: 'Enregistrer le paiement' }).click();
    resp = await paid;
    expect(resp.status()).toBe(201);
    expect((await resp.json()).status).toBe('PAID');
    await expect(row).toContainText('Payé');

    // 3. Le paiement Mobile Money est enregistré comme tel, avec sa référence.
    const payments = await (await api(request, 'admin').get('/payments/payments/?page_size=100')).json();
    const items = (payments.items ?? payments) as { reference: string; payment_method: string; amount: number }[];
    const om = items.find((p) => p.reference === omReference) as
      { payment_method: string; amount: number; payment_date: string } | undefined;
    expect(om?.payment_method).toBe('MOBILE_MONEY');
    expect(Number(om?.amount)).toBe(200000);
    // Bug corrigé : la date saisie n'était pas transmise (toujours aujourd'hui).
    expect(om?.payment_date?.slice(0, 10)).toBe(yesterday);

    // Historique : méthode traduite (bug corrigé : « MOBILE_MONEY » brut).
    await page.getByRole('tab', { name: 'Paiements' }).click();
    await expect(page.getByRole('tabpanel')).not.toContainText('MOBILE_MONEY');
  });
});
