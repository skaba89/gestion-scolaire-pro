/**
 * Exports comptables (FEC, Sage, Ciel) — données de l'écran
 * « Exports comptables » (`src/pages/admin/AccountingExports.tsx`).
 *
 * Défauts corrigés (audit 2026-11-03, API-02) : l'écran appelait
 * `GET /payments/` (inexistant), demandait les factures avec des filtres
 * de date que le serveur ignorait (50 premières factures, toutes dates),
 * recalculait les montants depuis les lignes au lieu du total de la facture,
 * incluait factures annulées et paiements annulés, et écrivait les noms
 * saisis sans protection dans des CSV ouverts par Excel.
 */
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { apiClient } from "@/api/client";

export type AccountingPeriod = "current_month" | "last_month" | "last_quarter" | "current_year";

export interface ExportInvoice {
  id: string;
  invoice_number: string;
  issue_date: string | null;
  due_date: string | null;
  status: string;
  total_amount: number;
  students: { first_name: string | null; last_name: string | null } | null;
}

export interface ExportPayment {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  status: string;
  invoices: { invoice_number: string } | null;
}

/** Bornes incluses, au format attendu par l'API (`AAAA-MM-JJ`). */
export function periodRange(period: string, now: Date = new Date()): { date_from: string; date_to: string } {
  let start: Date;
  let end: Date;
  switch (period) {
    case "last_month":
      start = startOfMonth(subMonths(now, 1));
      end = endOfMonth(subMonths(now, 1));
      break;
    case "last_quarter":
      // « 3 derniers mois » : le mois en cours et les deux précédents.
      start = startOfMonth(subMonths(now, 2));
      end = endOfMonth(now);
      break;
    case "current_year":
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31);
      break;
    case "current_month":
    default:
      start = startOfMonth(now);
      end = endOfMonth(now);
  }
  return { date_from: format(start, "yyyy-MM-dd"), date_to: format(end, "yyyy-MM-dd") };
}

const PAGE_SIZE = 100; // plafond serveur
/** Garde-fou : au-delà, l'export serait incomplet — on échoue plutôt que tronquer. */
export const MAX_EXPORT_PAGES = 200;

interface Page<T> {
  items: T[];
  pages: number;
}

/** Récupère TOUTES les pages : un journal comptable incomplet est faux. */
export async function fetchAllPages<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; ; page += 1) {
    const { data } = await apiClient.get<Page<T>>(path, { params: { ...params, page, page_size: PAGE_SIZE } });
    rows.push(...(data.items ?? []));
    const pages = data.pages ?? 1;
    if (page >= pages) return rows;
    if (page >= MAX_EXPORT_PAGES) {
      throw new Error(`Export trop volumineux (plus de ${MAX_EXPORT_PAGES * PAGE_SIZE} lignes) : choisir une période plus courte.`);
    }
  }
}

/** Factures et paiements comptabilisables de la période. */
export async function loadAccountingData(period: string): Promise<{ invoices: ExportInvoice[]; payments: ExportPayment[] }> {
  const range = periodRange(period);
  const [invoices, payments] = await Promise.all([
    fetchAllPages<ExportInvoice>("/payments/invoices/", range),
    fetchAllPages<ExportPayment>("/payments/payments/", { ...range, status: "COMPLETED" }),
  ]);
  return {
    // Brouillon = pas encore émis ; annulée = pas une vente.
    invoices: invoices.filter((i) => i.status !== "DRAFT" && i.status !== "CANCELLED"),
    payments,
  };
}

/**
 * Cellule CSV sûre, format inchangé pour les valeurs ordinaires (les
 * logiciels comptables importent des champs nus) :
 * - neutralisation des formules (=, +, -, @, tabulation, retour chariot en
 *   tête) — un nom saisi « =HYPERLINK(...) » ne doit pas s'exécuter dans Excel ;
 * - guillemets uniquement si la valeur contient `;`, `"` ou un saut de ligne.
 * Les montants sont produits par `amount()` (jamais négatifs ici) : pas de
 * préfixe parasite sur un nombre.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const row = (cells: unknown[]) => cells.map(csvCell).join(";") + "\n";
const amount = (n: number) => Number(n || 0).toFixed(2);
const day = (iso: string | null, pattern: string) => (iso ? format(new Date(`${iso.slice(0, 10)}T00:00:00`), pattern) : "");
const studentName = (i: ExportInvoice) =>
  [i.students?.first_name, i.students?.last_name].filter(Boolean).join(" ");
const pieceRef = (p: ExportPayment, fallback: string) => p.invoices?.invoice_number || fallback;

export function totals(invoices: ExportInvoice[], payments: ExportPayment[]) {
  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  return { totalInvoiced, totalPaid, balance: totalInvoiced - totalPaid };
}

export function invoicesCsv(invoices: ExportInvoice[]): string {
  return (
    row(["Numéro", "Date", "Échéance", "Élève", "Montant", "Statut"]) +
    invoices
      .map((i) => row([i.invoice_number, day(i.issue_date, "dd/MM/yyyy"), day(i.due_date, "dd/MM/yyyy"), studentName(i), amount(i.total_amount), i.status]))
      .join("")
  );
}

export function paymentsCsv(payments: ExportPayment[]): string {
  return (
    row(["Date", "Facture", "Montant", "Mode de paiement"]) +
    payments.map((p) => row([day(p.payment_date, "dd/MM/yyyy"), pieceRef(p, ""), amount(p.amount), p.payment_method])).join("")
  );
}

export function fecJournal(invoices: ExportInvoice[], payments: ExportPayment[]): string {
  let out = row([
    "JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum", "CompteLib", "CompAuxNum", "CompAuxLib",
    "PieceRef", "PieceDate", "EcritureLib", "Debit", "Credit", "EcritureLet", "DateLet", "ValidDate", "Montantdevise", "Idevise",
  ]);
  let n = 1;
  for (const i of invoices) {
    const d = day(i.issue_date, "yyyyMMdd");
    const lib = `Facture ${i.invoice_number}`;
    out += row(["VE", "Ventes", n, d, "411000", "Clients", "", "", i.invoice_number, d, lib, amount(i.total_amount), "0", "", "", "", "", ""]);
    out += row(["VE", "Ventes", n, d, "706000", "Prestations de services", "", "", i.invoice_number, d, lib, "0", amount(i.total_amount), "", "", "", "", ""]);
    n += 1;
  }
  for (const p of payments) {
    const d = day(p.payment_date, "yyyyMMdd");
    const ref = pieceRef(p, "PAIEMENT");
    out += row(["BQ", "Banque", n, d, "512000", "Banque", "", "", ref, d, "Encaissement", amount(p.amount), "0", "", "", "", "", ""]);
    out += row(["BQ", "Banque", n, d, "411000", "Clients", "", "", ref, d, "Encaissement", "0", amount(p.amount), "", "", "", "", ""]);
    n += 1;
  }
  return out;
}

export function sageExport(invoices: ExportInvoice[], payments: ExportPayment[]): string {
  let out = "";
  for (const i of invoices) {
    const d = day(i.issue_date, "ddMMyyyy");
    out += row(["M", "VTE", d, i.invoice_number, "411000", "D", amount(i.total_amount), `Facture ${i.invoice_number}`]);
    out += row(["M", "VTE", d, i.invoice_number, "706000", "C", amount(i.total_amount), `Facture ${i.invoice_number}`]);
  }
  for (const p of payments) {
    const d = day(p.payment_date, "ddMMyyyy");
    const ref = pieceRef(p, "ENC");
    out += row(["M", "BNQ", d, ref, "512000", "D", amount(p.amount), "Encaissement"]);
    out += row(["M", "BNQ", d, ref, "411000", "C", amount(p.amount), "Encaissement"]);
  }
  return out;
}

export function cielExport(invoices: ExportInvoice[], payments: ExportPayment[]): string {
  let out = row(["CIEL COMPTA", "Version 1.0"]) + row(["Code journal", "Date", "N° pièce", "Compte", "Libellé", "Débit", "Crédit"]);
  for (const i of invoices) {
    const d = day(i.issue_date, "dd/MM/yyyy");
    out += row(["VTE", d, i.invoice_number, "411000", `Facture ${i.invoice_number}`, amount(i.total_amount), "0"]);
    out += row(["VTE", d, i.invoice_number, "706000", `Facture ${i.invoice_number}`, "0", amount(i.total_amount)]);
  }
  for (const p of payments) {
    const d = day(p.payment_date, "dd/MM/yyyy");
    const ref = pieceRef(p, "ENC");
    out += row(["BNQ", d, ref, "512000", "Encaissement", amount(p.amount), "0"]);
    out += row(["BNQ", d, ref, "411000", "Encaissement", "0", amount(p.amount)]);
  }
  return out;
}
