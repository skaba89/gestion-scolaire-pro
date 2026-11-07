import { describe, expect, it } from "vitest";
import { canLoadPaymentReminders } from "../reminderAccess";

describe("reminder payment access", () => {
  it("loads family invoices only for a parent", () => {
    expect(canLoadPaymentReminders(["PARENT"])).toBe(true);
    expect(canLoadPaymentReminders(["STUDENT"])).toBe(false);
    expect(canLoadPaymentReminders(["TEACHER"])).toBe(false);
    expect(canLoadPaymentReminders([])).toBe(false);
  });
});
