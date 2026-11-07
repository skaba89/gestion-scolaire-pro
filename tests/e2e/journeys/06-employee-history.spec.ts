import { expect, test } from '@playwright/test';
import { api, stateFile, ulsUrl } from './helpers';

test.use({ storageState: stateFile('admin') });

test('RH : désactiver conserve la paie et la suppression est refusée', async ({ page, request }) => {
  const admin = api(request, 'admin');
  const number = `E2E-HR-${Date.now()}`;
  const created = await admin.post('/hr/employees/', {
    employee_number: number, first_name: 'Fatoumata', last_name: 'Historique', hire_date: '2026-09-01',
  });
  expect(created.ok()).toBeTruthy();
  const employee = await created.json();
  const paid = await admin.post('/hr/payslips/', {
    employee_id: employee.id, period_month: 10, period_year: 2026,
    gross_salary: 2500000, net_salary: 2200000, pay_date: '2026-10-31', is_final: 'true',
  });
  expect(paid.ok()).toBeTruthy();
  const payslip = await paid.json();

  await page.goto(ulsUrl('/admin/hr'));
  await page.getByPlaceholder('Rechercher...', { exact: true }).fill(number);
  const row = page.getByRole('row').filter({ hasText: number });
  await row.getByRole('button', { name: 'Modifier', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const active = dialog.getByRole('switch', { name: 'Employé actif' });
  await expect(active).toHaveAttribute('aria-checked', 'true');
  await active.click();
  await expect(active).toHaveAttribute('aria-checked', 'false');
  const updated = page.waitForResponse(r => r.url().endsWith(`/hr/employees/${employee.id}/`) && r.request().method() === 'PUT');
  await dialog.getByRole('button', { name: 'Mettre à jour' }).click();
  expect((await updated).ok()).toBeTruthy();
  await expect(dialog).toBeHidden();
  await expect(row.getByText('Inactif', { exact: true })).toBeVisible();

  await row.getByRole('button', { name: 'Supprimer', exact: true }).click();
  const refused = page.waitForResponse(r => r.url().endsWith(`/hr/employees/${employee.id}/`) && r.request().method() === 'DELETE');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer', exact: true }).click();
  expect((await refused).status()).toBe(409);
  await expect(page.getByText(/Cet employé possède un historique/)).toBeVisible();
  await expect(row).toBeVisible();
  const saved = await admin.get(`/hr/employees/${employee.id}/`);
  expect(saved.status()).toBe(200);
  expect((await saved.json()).is_active).toBe(false);
  const payroll = await admin.get('/hr/payslips/');
  expect(payroll.status()).toBe(200);
  expect(await payroll.json()).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: payslip.id, employee_id: employee.id, net_salary: 2200000 }),
  ]));
});
