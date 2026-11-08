import { describe, expect, it } from "vitest";
import { parseInvoicesResponse, parsePaymentsResponse } from "./financeReadContracts";

describe("financial read contracts (fail closed)", () => {
    it("accepts empty successful invoice pages only with a real total", () => {
        expect(parseInvoicesResponse({ items: [], total: 0 })).toEqual({ invoices: [], totalCount: 0 });
    });
    it("preserves pagination total rather than only the loaded page count", () => {
        const invoice = { id: "i1", total_amount: 100 };
        expect(parseInvoicesResponse({ items: [invoice], total: 25 })).toEqual({
            invoices: [invoice], totalCount: 25,
        });
    });
    it("supports historical invoice arrays and named invoices with counts", () => {
        expect(parseInvoicesResponse([])).toEqual({ invoices: [], totalCount: 0 });
        expect(parseInvoicesResponse({ invoices: [], totalCount: 0 })).toEqual({ invoices: [], totalCount: 0 });
    });
    it.each([null, undefined, {}, { items: [] }, { total: 1 },
        { items: [], total: -1 }, { items: [], total: "0" },
        { items: [null], total: 1 }, { items: [{ id: "i" }], total: 0 }])(
        "never presents a malformed invoice result as an empty successful list: %s",
        (payload) => expect(() => parseInvoicesResponse(payload)).toThrow("Réponse des factures invalide"),
    );
    it("accepts real empty payment responses and paginated payment objects", () => {
        expect(parsePaymentsResponse([])).toEqual([]);
        expect(parsePaymentsResponse({ items: [] })).toEqual([]);
        expect(parsePaymentsResponse({ items: [{ id: "p1", amount: 100 }] })).toHaveLength(1);
    });
    it.each([null, undefined, {}, { total: 2 }, { items: null },
        { items: [null] }, { items: "not-a-list" }])(
        "never converts invalid payment responses into zero revenue: %s",
        (payload) => expect(() => parsePaymentsResponse(payload)).toThrow("Réponse des paiements invalide"),
    );
});
