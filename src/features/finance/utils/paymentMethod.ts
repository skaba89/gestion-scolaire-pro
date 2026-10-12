const PAYMENT_METHOD_LABELS: Record<string, string> = {
    cash: "Espèces",
    bank_transfer: "Virement",
    mobile_money: "Mobile Money",
    check: "Chèque",
};

/** L'API renvoie la méthode en majuscules (CASH, MOBILE_MONEY…) : la
 *  comparaison en minuscules seule laissait s'afficher la valeur brute. */
export function paymentMethodLabel(method?: string | null): string {
    if (!method) return "-";
    return PAYMENT_METHOD_LABELS[method.toLowerCase()] ?? method;
}
