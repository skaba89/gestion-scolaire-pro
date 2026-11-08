import { afterEach, describe, expect, it } from "vitest";
import type { AxiosAdapter } from "axios";
import { apiClient } from "@/api/client";
import { fetchFinanceOverview } from "./financeOverviewApi";

const oldAdapter = apiClient.defaults.adapter;

describe("finance overview API", () => {
    afterEach(() => { apiClient.defaults.adapter = oldAdapter; });

    it("reads complete authoritative counts, not the page-length subset", async () => {
        const calls: string[] = [];
        const overview = {
            total_invoices: 100, paid_invoices: 50, overdue_invoices: 20,
            outstanding_amount: 15000, completed_payments: 87,
            received_amount: 50000,
        };
        apiClient.defaults.adapter = (async config => {
            calls.push(config.url ?? "");
            return {status: 200, statusText: "OK", headers: {}, config, data: overview};
        }) as AxiosAdapter;
        await expect(fetchFinanceOverview()).resolves.toEqual(overview);
        expect(calls).toEqual(["/payments/overview/"]);
    });

    it.each([
        null,
        {},
        {total_invoices: 10, paid_invoices: 9, overdue_invoices: 2,
         outstanding_amount: 0, completed_payments: 5, received_amount: 40},
        {total_invoices: 0, paid_invoices: 0, overdue_invoices: 0,
         outstanding_amount: -1, completed_payments: 0, received_amount: 0},
        {total_invoices: 1, paid_invoices: 0, overdue_invoices: 0,
         outstanding_amount: "10", completed_payments: 0, received_amount: 0},
    ])("rejects malformed or inconsistent financial summaries", async payload => {
        apiClient.defaults.adapter = (async config =>
            ({status: 200, statusText: "OK", headers: {}, config, data: payload})) as AxiosAdapter;
        await expect(fetchFinanceOverview()).rejects.toThrow("Statistiques financières invalides");
    });

    it("never displays fake zero revenue on a forbidden or missing endpoint", async () => {
        apiClient.defaults.adapter = (async config => Promise.reject({
            isAxiosError: true, config, response: {status: 403, data: {detail: "Forbidden"}, headers: {}, config},
        })) as AxiosAdapter;
        await expect(fetchFinanceOverview()).rejects.toBeDefined();
    });
});
