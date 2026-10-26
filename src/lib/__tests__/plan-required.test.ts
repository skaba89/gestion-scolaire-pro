import { describe, expect, it } from "vitest";

import { isPlanRequiredError, PlanRequiredError } from "@/lib/plan-required";

describe("isPlanRequiredError", () => {
  it("reconnaît un 402 axios", () => {
    expect(isPlanRequiredError({ response: { status: 402, data: {} } })).toBe(true);
  });

  it("reconnaît le code PLAN_REQUIRED du corps", () => {
    expect(isPlanRequiredError({ response: { status: 400, data: { error: "PLAN_REQUIRED" } } })).toBe(true);
  });

  it("reconnaît la PlanRequiredError du flux fetch", () => {
    expect(isPlanRequiredError(new PlanRequiredError())).toBe(true);
  });

  it("ignore les autres erreurs", () => {
    expect(isPlanRequiredError({ response: { status: 500, data: { error: "HTTP_ERROR" } } })).toBe(false);
    expect(isPlanRequiredError(new Error("Network Error"))).toBe(false);
    expect(isPlanRequiredError(null)).toBe(false);
  });
});
