/**
 * Régression : la facturation était inutilisable via l'UI.
 * 1) invoiceSchema exigeait invoice_number (géré hors RHF) → submit bloqué en
 *    silence. Il doit être OPTIONNEL.
 * 2) La liste des factures lit désormais {items,total} renvoyés par l'API.
 */
import { describe, expect, it } from "vitest";

import { invoiceSchema } from "@/lib/validations/financeSchemas";

const baseInvoice = {
  student_id: "74d91d39-1d07-4acb-a73f-5cec504f1a76",
  due_date: "2026-10-31",
  items: [
    { name: "Frais d'inscription", quantity: 1, unit_price: 750000, total: 750000 },
  ],
};

describe("invoiceSchema", () => {
  it("valide une facture SANS invoice_number (champ géré hors RHF)", () => {
    const result = invoiceSchema.safeParse(baseInvoice);
    expect(result.success).toBe(true);
  });

  it("valide aussi une facture AVEC invoice_number", () => {
    const result = invoiceSchema.safeParse({ ...baseInvoice, invoice_number: "INV-2026-1" });
    expect(result.success).toBe(true);
  });

  it("rejette une facture sans étudiant", () => {
    const result = invoiceSchema.safeParse({ ...baseInvoice, student_id: "" });
    expect(result.success).toBe(false);
  });

  it("rejette une facture sans ligne", () => {
    const result = invoiceSchema.safeParse({ ...baseInvoice, items: [] });
    expect(result.success).toBe(false);
  });
});
