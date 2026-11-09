import { expect, test } from '@playwright/test';
import { API, api, tokenOf } from './helpers';

/**
 * Parcours 15 — annulation d'un encaissement et export comptable (B6, F6).
 *
 * Un encaissement saisi par erreur est annulé (jamais supprimé) : la facture
 * revient au solde restant dû, une seconde annulation est refusée, le reçu
 * porte la mention « annulé » et l'export CSV conserve la ligne avec le
 * statut REVERSED. Le parent ne peut ni annuler ni exporter les paiements
 * d'une autre famille.
 */
const run = Date.now().toString(36).toUpperCase();
type Invoice = { id: string; paid_amount: number; status: string };

test('annulation d\'encaissement, reçu annulé et export CSV', async ({ request }) => {
  const admin = api(request, 'admin');
  const created = await admin.post('/students/', {
    first_name: 'Mariama', last_name: `Diallo-${run}`, date_of_birth: '2006-03-04', gender: 'FEMALE',
    registration_number: `E2E-REV-${run}`,
  });
  expect(created.status()).toBe(201);
  const studentId = (await created.json()).id as string;
  const inv = await admin.post('/payments/invoices/', { student_id: studentId, total_amount: 300000, notes: 'E2E parcours 15' });
  expect(inv.status()).toBe(201);
  const invoiceId = (await inv.json()).invoice_id as string;
  const invoice = async (): Promise<Invoice> => {
    const body = await (await admin.get(`/payments/invoices/?student_id=${studentId}`)).json();
    const list = (Array.isArray(body) ? body : body.items ?? []) as Invoice[];
    return list.find((i) => i.id === invoiceId)!;
  };

  // Deux encaissements : Mobile Money (référence de l'opérateur) puis espèces.
  const omRef = `OM-REV-${run}`;
  const om = await admin.post('/payments/register/', { invoice_id: invoiceId, amount: 200000, method: 'MOBILE_MONEY', reference: omRef });
  expect(om.status()).toBe(201);
  const omId = (await om.json()).id as string;
  const cash = await admin.post('/payments/register/', { invoice_id: invoiceId, amount: 100000, method: 'CASH' });
  expect(cash.status()).toBe(201);
  const cashRef = (await cash.json()).reference as string;
  expect(await invoice()).toMatchObject({ status: 'PAID' });
  expect(Number((await invoice()).paid_amount)).toBe(300000);

  // Le parent (autre famille, sans payments:write) ne peut pas annuler.
  const byParent = await request.post(`${API}/payments/${omId}/reverse/`, {
    headers: { Authorization: `Bearer ${tokenOf('parent')}` }, data: { notes: 'tentative' },
  });
  expect(byParent.status()).toBe(403);

  // Annulation du Mobile Money : la facture revient à 100 000 / PARTIAL.
  expect((await admin.post(`/payments/${omId}/reverse/`, { notes: 'Transfert en double' })).status()).toBe(200);
  expect(await invoice()).toMatchObject({ status: 'PARTIAL' });
  expect(Number((await invoice()).paid_amount)).toBe(100000);

  // Une seconde annulation est refusée et ne recrédite rien.
  const again = await admin.post(`/payments/${omId}/reverse/`, { notes: 'rejeu' });
  expect(again.status()).toBe(400);
  expect(Number((await invoice()).paid_amount)).toBe(100000);

  // Le reçu reste consultable et porte la mention d'annulation.
  const receipt = await admin.get(`/payments/${omId}/receipt/`);
  expect(receipt.status()).toBe(200);
  const html = Buffer.from(((await receipt.json()) as { html: string }).html, 'base64').toString('utf8');
  expect(html).toContain('Paiement annulé');
  expect(html).toContain('Transfert en double');

  // Le solde peut de nouveau être encaissé après l'annulation.
  expect((await admin.post('/payments/register/', { invoice_id: invoiceId, amount: 200000, method: 'MOBILE_MONEY', reference: `OM-REV2-${run}` })).status()).toBe(201);
  expect(await invoice()).toMatchObject({ status: 'PAID' });

  // Export CSV : la ligne annulée est conservée avec son statut.
  const csv = await admin.get(`/payments/export/?student_id=${studentId}`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()['content-type']).toContain('text/csv');
  const lines = (await csv.text()).replace(/^\uFEFF+/, '').trim().split(/\r?\n/);
  expect(lines[0]).toBe('reference,date,eleve,matricule,facture,montant,devise,mode,statut');
  const row = (ref: string) => lines.find((l) => l.startsWith(`${ref},`)) ?? '';
  expect(row(omRef)).toMatch(/,REVERSED$/);
  expect(row(cashRef)).toMatch(/,COMPLETED$/);
  expect(lines).toHaveLength(4);
  const reversedOnly = await (await admin.get(`/payments/export/?student_id=${studentId}&status=REVERSED`)).text();
  expect(reversedOnly).toContain(omRef);
  expect(reversedOnly).not.toContain(cashRef);

  // Le parent n'exporte que les paiements de ses propres enfants.
  const parentHeaders = { Authorization: `Bearer ${tokenOf('parent')}` };
  const foreign = await request.get(`${API}/payments/export/?student_id=${studentId}`, { headers: parentHeaders });
  expect(foreign.status()).toBe(403);
  const own = await request.get(`${API}/payments/export/`, { headers: parentHeaders });
  expect(own.status()).toBe(200);
  const ownText = await own.text();
  expect(ownText).not.toContain(omRef);
  expect(ownText).not.toContain(cashRef);
});
