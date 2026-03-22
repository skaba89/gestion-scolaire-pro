import { supabase } from "@/integrations/supabase/client";

/**
 * Génère un numéro de facture au format FAC-AAAAMM-#####
 * Le compteur se réinitialise chaque mois
 * Exemple: FAC-202512-00001
 */
export async function generateInvoiceNumber(tenantId: string): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `FAC-${year}${month}`;

  // Récupérer la dernière facture du mois en cours
  const { data: lastInvoice, error } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("tenant_id", tenantId)
    .like("invoice_number", `${prefix}%`)
    .order("invoice_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error fetching last invoice:", error);
    return `${prefix}00001`;
  }

  let nextSequence = 1;

  if (lastInvoice?.invoice_number) {
    // Extraire le numéro de séquence de la dernière facture (les 5 derniers caractères)
    const lastSequenceStr = lastInvoice.invoice_number.slice(-5);
    const lastSequence = parseInt(lastSequenceStr, 10);
    if (!isNaN(lastSequence)) {
      nextSequence = lastSequence + 1;
    }
  }

  return `${prefix}${String(nextSequence).padStart(5, "0")}`;
}

/**
 * Valide le format d'un numéro de facture (FAC-YYYYMMXXXXX)
 */
export function isValidInvoiceNumber(invoiceNumber: string): boolean {
  const pattern = /^FAC-\d{6}\d{5}$/;
  return pattern.test(invoiceNumber);
}
