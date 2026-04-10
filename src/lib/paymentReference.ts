import { apiClient } from "@/api/client";

/**
 * Génère un numéro de transaction au format PAY-AAAAMM-#####
 */
export async function generatePaymentReference(tenantId: string): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const prefix = `PAY-${year}${month}-`;

    try {
        const { data: lastPayment } = await apiClient.get<any[]>("/finance/payments/", {
            params: { tenant_id: tenantId, reference_prefix: prefix, limit: "1" },
        });

        let nextSequence = 1;
        if (lastPayment?.[0]?.reference) {
            const lastSequenceStr = lastPayment[0].reference.replace(prefix, "");
            const lastSequence = parseInt(lastSequenceStr, 10);
            if (!isNaN(lastSequence)) nextSequence = lastSequence + 1;
        }

        return `${prefix}${String(nextSequence).padStart(5, "0")}`;
    } catch {
        console.error("Error fetching last payment reference, using default");
        return `${prefix}00001`;
    }
}

export function isValidPaymentReference(reference: string): boolean {
    const pattern = /^PAY-\d{6}-\d{5}$/;
    return pattern.test(reference);
}
