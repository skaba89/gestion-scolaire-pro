import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { isLegacySupabaseShim, supabase } from "@/integrations/supabase/client";

describe("legacy supabase shim", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  beforeEach(() => {
    warnSpy.mockClear();
  });

  afterEach(() => {
    warnSpy.mockClear();
  });

  it("exposes the shim marker for migration tracking", () => {
    expect(isLegacySupabaseShim).toBe(true);
  });

  it("returns a chainable query object without throwing", async () => {
    const response = await supabase.from("students").select("*").eq("tenant_id", "tenant-1");
    expect(response).toEqual({ data: [], error: null, count: 0 });
  });

  it("warns only once per legacy access pattern", async () => {
    await supabase.from("students").select("*");
    await supabase.from("students").select("*");

    const messages = warnSpy.mock.calls.map((call) => call.join(" "));
    const studentWarnings = messages.filter((message) => message.includes('students'));

    expect(studentWarnings.length).toBeLessThanOrEqual(1);
  });
});
