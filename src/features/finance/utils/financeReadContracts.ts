/** Fail closed: malformed financial API responses must never appear as zero balances. */
export function parseInvoicesResponse(data: unknown): { invoices: any[]; totalCount: number } {
    if (Array.isArray(data)) return { invoices: data, totalCount: data.length };
    if (!data || typeof data !== "object") {
        throw new Error("Réponse des factures invalide");
    }
    const value = data as Record<string, unknown>;
    const invoices = Array.isArray(value.items)
        ? value.items
        : Array.isArray(value.invoices) ? value.invoices : null;
    const total = value.total ?? value.totalCount;
    if (!invoices || !Number.isSafeInteger(total) || (total as number) < invoices.length ||
        invoices.some(invoice => !invoice || typeof invoice !== "object")) {
        throw new Error("Réponse des factures invalide");
    }
    return { invoices, totalCount: total as number };
}

export function parsePaymentsResponse(data: unknown): any[] {
    const items = Array.isArray(data)
        ? data
        : data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).items)
            ? (data as {items: unknown[]}).items
            : null;
    if (!items || items.some(payment => !payment || typeof payment !== "object")) {
        throw new Error("Réponse des paiements invalide");
    }
    return items;
}
