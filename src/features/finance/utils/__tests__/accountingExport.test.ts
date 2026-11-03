import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
vi.mock('@/api/client', () => ({ apiClient: { get: (...args: unknown[]) => get(...args) } }));

import {
  csvCell,
  fecJournal,
  fetchAllPages,
  invoicesCsv,
  loadAccountingData,
  MAX_EXPORT_PAGES,
  periodRange,
  sageExport,
  totals,
  type ExportInvoice,
  type ExportPayment,
} from '../accountingExport';

const invoice = (over: Partial<ExportInvoice> = {}): ExportInvoice => ({
  id: 'i1', invoice_number: 'FAC-2026-001', issue_date: '2026-11-02', due_date: '2026-12-02',
  status: 'PENDING', total_amount: 150000, students: { first_name: 'Aïssatou', last_name: 'Diallo' }, ...over,
});
const payment = (over: Partial<ExportPayment> = {}): ExportPayment => ({
  id: 'p1', amount: 50000, payment_date: '2026-11-03', payment_method: 'MOBILE_MONEY',
  status: 'COMPLETED', invoices: { invoice_number: 'FAC-2026-001' }, ...over,
});

beforeEach(() => get.mockReset());

describe('periodRange', () => {
  const now = new Date(2026, 10, 15); // 15 novembre 2026

  it('borne le mois en cours et le mois précédent', () => {
    expect(periodRange('current_month', now)).toEqual({ date_from: '2026-11-01', date_to: '2026-11-30' });
    expect(periodRange('last_month', now)).toEqual({ date_from: '2026-10-01', date_to: '2026-10-31' });
  });

  it('« 3 derniers mois » couvre 3 mois, pas 4 (défaut corrigé)', () => {
    expect(periodRange('last_quarter', now)).toEqual({ date_from: '2026-09-01', date_to: '2026-11-30' });
  });

  it("couvre l'année civile", () => {
    expect(periodRange('current_year', now)).toEqual({ date_from: '2026-01-01', date_to: '2026-12-31' });
  });
});

describe('fetchAllPages', () => {
  it('récupère toutes les pages au plafond serveur de 100 lignes', async () => {
    get
      .mockResolvedValueOnce({ data: { items: [{ id: 1 }, { id: 2 }], pages: 3 } })
      .mockResolvedValueOnce({ data: { items: [{ id: 3 }], pages: 3 } })
      .mockResolvedValueOnce({ data: { items: [{ id: 4 }], pages: 3 } });

    const rows = await fetchAllPages<{ id: number }>('/payments/payments/', { date_from: '2026-11-01' });

    expect(rows.map((r) => r.id)).toEqual([1, 2, 3, 4]);
    expect(get).toHaveBeenCalledTimes(3);
    expect(get.mock.calls[2][1].params).toEqual({ date_from: '2026-11-01', page: 3, page_size: 100 });
  });

  it("échoue au lieu de tronquer un export trop volumineux", async () => {
    get.mockResolvedValue({ data: { items: [{}], pages: MAX_EXPORT_PAGES + 5 } });
    await expect(fetchAllPages('/payments/payments/', {})).rejects.toThrow(/période plus courte/);
    expect(get).toHaveBeenCalledTimes(MAX_EXPORT_PAGES);
  });

  it("propage une erreur réseau (pas d'export vide silencieux)", async () => {
    get.mockRejectedValueOnce(new Error('Network Error'));
    await expect(fetchAllPages('/payments/invoices/', {})).rejects.toThrow('Network Error');
  });
});

describe('loadAccountingData', () => {
  it('interroge les routes réelles avec la période, et seulement les paiements encaissés', async () => {
    get.mockImplementation(async (path: string) =>
      path === '/payments/invoices/'
        ? { data: { items: [invoice(), invoice({ id: 'i2', status: 'CANCELLED' }), invoice({ id: 'i3', status: 'DRAFT' })], pages: 1 } }
        : { data: { items: [payment()], pages: 1 } },
    );

    const { invoices, payments } = await loadAccountingData('current_month');

    const paths = get.mock.calls.map((c) => c[0]).sort();
    expect(paths).toEqual(['/payments/invoices/', '/payments/payments/']);
    const paymentCall = get.mock.calls.find((c) => c[0] === '/payments/payments/');
    expect(paymentCall?.[1].params.status).toBe('COMPLETED');
    expect(paymentCall?.[1].params.date_from).toMatch(/^\d{4}-\d{2}-01$/);
    // Brouillons et factures annulées ne sont pas des ventes.
    expect(invoices.map((i) => i.id)).toEqual(['i1']);
    expect(payments).toHaveLength(1);
  });
});

describe('montants et journaux', () => {
  it('utilise le total de la facture, pas une somme recalculée des lignes', () => {
    expect(totals([invoice({ total_amount: 150000 })], [payment({ amount: 50000 })])).toEqual({
      totalInvoiced: 150000, totalPaid: 50000, balance: 100000,
    });
  });

  it('écrit nom de l’élève, date d’émission et numéro de facture (champs réels de l’API)', () => {
    const csv = invoicesCsv([invoice()]);
    expect(csv.split('\n')[1]).toBe('FAC-2026-001;02/11/2026;02/12/2026;Aïssatou Diallo;150000.00;PENDING');
  });

  it('équilibre chaque écriture FEC (débit = crédit) et référence la facture payée', () => {
    const lines = fecJournal([invoice()], [payment()]).trim().split('\n').slice(1).map((l) => l.split(';'));
    const debit = lines.reduce((s, l) => s + Number(l[11]), 0);
    const credit = lines.reduce((s, l) => s + Number(l[12]), 0);
    expect(debit).toBe(credit);
    expect(lines[2][8]).toBe('FAC-2026-001');
  });

  it('garde le format Sage sans guillemets pour les valeurs ordinaires', () => {
    expect(sageExport([invoice()], []).split('\n')[0]).toBe('M;VTE;02112026;FAC-2026-001;411000;D;150000.00;Facture FAC-2026-001');
  });
});

describe('csvCell — injection de formule', () => {
  it('neutralise une formule saisie dans un nom', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+33612')).toBe("'+33612");
    expect(csvCell('@cmd')).toBe("'@cmd");
  });

  it('protège le séparateur et laisse les valeurs ordinaires intactes', () => {
    expect(csvCell('Bah; Kadiatou')).toBe('"Bah; Kadiatou"');
    expect(csvCell('150000.00')).toBe('150000.00');
    expect(csvCell(null)).toBe('');
  });

  it('applique la protection dans les exports réels', () => {
    const csv = invoicesCsv([invoice({ students: { first_name: '=1+1', last_name: null } })]);
    expect(csv).toContain(";'=1+1;");
  });
});
