import { apiClient } from "@/api/client";

/**
 * Génère un numéro de facture au format FAC-AAAAMM-#####
 * Le compteur se réinitialise chaque mois
 */
export async function generateInvoiceNumber(tenantId: string): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `FAC-${year}${month}`;

  try {
    const { data: lastInvoice } = await apiClient.get<any[]>("/finance/invoices/", {
      params: { tenant_id: tenantId, invoice_number_prefix: prefix, limit: "1" },
    });

    let nextSequence = 1;
    if (lastInvoice?.[0]?.invoice_number) {
      const lastSequenceStr = lastInvoice[0].invoice_number.slice(-5);
      const lastSequence = parseInt(lastSequenceStr, 10);
      if (!isNaN(lastSequence)) nextSequence = lastSequence + 1;
    }

    return `${prefix}${String(nextSequence).padStart(5, "0")}`;
  } catch {
    console.error("Error fetching last invoice, using default sequence");
    return `${prefix}00001`;
  }
}

export function isValidInvoiceNumber(invoiceNumber: string): boolean {
  const pattern = /^FAC-\d{6}\d{5}$/;
  return pattern.test(invoiceNumber);
}
