import { expect, test } from '@playwright/test';
import { API, api, tokenOf } from './helpers';

/**
 * Parcours 14 — un parent ne peut pas solder lui-même une facture (F1, P0).
 *
 * POST /parents/payments/create/ avec la méthode CASH ou BANK_TRANSFER
 * enregistrait le paiement directement COMPLETED et créditait la facture :
 * le compte parent de recette soldait 750 000 GNF sans payer. Ces
 * encaissements sont réservés au personnel (payments:write).
 */
test('le parent ne peut pas déclarer un paiement en espèces ou par virement', async ({ request }) => {
  const admin = api(request, 'admin');
  const students = (await (await admin.get('/students/?search=E2E-ROLE-ETU')).json()).items as
    { id: string; registration_number: string }[];
  const child = students.find((s) => s.registration_number === 'E2E-ROLE-ETU')!;

  const created = await admin.post('/payments/invoices/', { student_id: child.id, total_amount: 750000, notes: 'E2E parcours 14' });
  expect(created.status()).toBe(201);
  const invoiceId = (await created.json()).invoice_id as string;

  for (const method of ['CASH', 'BANK_TRANSFER']) {
    const attempt = await request.post(`${API}/parents/payments/create/`, {
      headers: { Authorization: `Bearer ${tokenOf('parent')}` },
      data: { invoice_id: invoiceId, amount: 750000, method },
    });
    expect(attempt.status(), `méthode ${method}`).toBe(403);
  }

  const invoices = (await (await admin.get(`/payments/invoices/?student_id=${child.id}`)).json()) as
    { items?: { id: string; paid_amount: number; status: string }[] } | { id: string; paid_amount: number; status: string }[];
  const list = Array.isArray(invoices) ? invoices : invoices.items ?? [];
  const invoice = list.find((i) => i.id === invoiceId)!;
  expect(Number(invoice.paid_amount)).toBe(0);
  expect(invoice.status).not.toBe('PAID');
});
