import { supabase } from "@/integrations/supabase/client";

/**
 * Génère un numéro de transaction au format PAY-AAAAMM-#####
 * Le compteur se réinitialise chaque mois
 * Exemple: PAY-202512-00001
 */
export async function generatePaymentReference(tenantId: string): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const prefix = `PAY-${year}${month}-`;

    // Récupérer le dernier paiement du mois en cours
    const { data: lastPayment, error } = await supabase
        .from("payments")
        .select("reference")
        .eq("tenant_id", tenantId)
        .like("reference", `${prefix}%`)
        .order("reference", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error("Error fetching last payment reference:", error);
        // Fallback: utiliser un timestamp ou la valeur par défaut
        return `${prefix}00001`;
    }

    let nextSequence = 1;

    if (lastPayment?.reference) {
        // Extraire le numéro de séquence de la dernière référence
        const lastSequenceStr = lastPayment.reference.replace(prefix, "");
        const lastSequence = parseInt(lastSequenceStr, 10);
        if (!isNaN(lastSequence)) {
            nextSequence = lastSequence + 1;
        }
    }

    return `${prefix}${String(nextSequence).padStart(5, "0")}`;
}

/**
 * Valide le format d'un numéro de transaction
 */
export function isValidPaymentReference(reference: string): boolean {
    const pattern = /^PAY-\d{6}-\d{5}$/;
    return pattern.test(reference);
}
