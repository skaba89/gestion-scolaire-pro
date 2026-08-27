/**
 * Pure-function tests for the Website Builder premium foundation —
 * registry lookup, theme resolution, and section normalization. No
 * React needed, fast.
 */
import { describe, expect, it } from "vitest";
import { getSiteTemplate, getSiteTemplatesFor, siteTemplateRegistry } from "../registry/siteTemplateRegistry";
import { resolveTheme } from "../theme/themeResolver";
import { DEFAULT_TOKENS, withAlpha, shadowClassFor } from "../theme/tokens";
import { normalizeSections } from "../types/sections";

describe("siteTemplateRegistry", () => {
  it("getSiteTemplate returns the School Excellence template by id", () => {
    const tpl = getSiteTemplate("school-excellence");
    expect(tpl).toBeDefined();
    expect(tpl?.name).toBe("School Excellence");
  });

  it("getSiteTemplate returns undefined for an unknown id", () => {
    expect(getSiteTemplate("does-not-exist")).toBeUndefined();
  });

  it("getSiteTemplate returns undefined for a falsy id (no tenant opt-in)", () => {
    expect(getSiteTemplate(undefined)).toBeUndefined();
    expect(getSiteTemplate(null)).toBeUndefined();
    expect(getSiteTemplate("")).toBeUndefined();
  });

  it("getSiteTemplatesFor filters by compatible tenant group", () => {
    expect(getSiteTemplatesFor("highschool").map((t) => t.id)).toContain("school-excellence");
    expect(getSiteTemplatesFor("university").map((t) => t.id)).not.toContain("school-excellence");
    expect(getSiteTemplatesFor("primary")).toHaveLength(0);
    expect(getSiteTemplatesFor("default")).toHaveLength(0);
  });

  it("every registered template has a stable, unique id", () => {
    const ids = siteTemplateRegistry.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("resolveTheme", () => {
  it("keeps template defaults when the tenant hasn't overridden colors", () => {
    const resolved = resolveTheme(DEFAULT_TOKENS, { primary_color: "", secondary_color: null });
    expect(resolved.primaryColor).toBe(DEFAULT_TOKENS.primaryColor);
    expect(resolved.secondaryColor).toBe(DEFAULT_TOKENS.secondaryColor);
  });

  it("overrides only primary/secondary color, keeps every other token as the template's identity", () => {
    const resolved = resolveTheme(DEFAULT_TOKENS, { primary_color: "#ff0000", secondary_color: "#00ff00" });
    expect(resolved.primaryColor).toBe("#ff0000");
    expect(resolved.secondaryColor).toBe("#00ff00");
    expect(resolved.fontHeading).toBe(DEFAULT_TOKENS.fontHeading);
    expect(resolved.borderRadius).toBe(DEFAULT_TOKENS.borderRadius);
    expect(resolved.accentColor).toBe(DEFAULT_TOKENS.accentColor);
  });
});

describe("tokens helpers", () => {
  it("withAlpha appends a correctly-rounded 2-digit hex alpha suffix", () => {
    expect(withAlpha("#123456", 1)).toBe("#123456ff");
    expect(withAlpha("#123456", 0)).toBe("#12345600");
    expect(withAlpha("#123456", 0.5)).toBe("#12345680");
  });

  it("withAlpha clamps out-of-range opacity", () => {
    expect(withAlpha("#123456", 2)).toBe("#123456ff");
    expect(withAlpha("#123456", -1)).toBe("#12345600");
  });

  it("shadowClassFor maps every shadow level to a Tailwind class", () => {
    expect(shadowClassFor({ ...DEFAULT_TOKENS, shadowLevel: "none" })).toBe("shadow-none");
    expect(shadowClassFor({ ...DEFAULT_TOKENS, shadowLevel: "xl" })).toBe("shadow-xl");
  });
});

describe("normalizeSections", () => {
  it("passes through sections with recognized types", () => {
    const raw = [{ type: "hero", title: "Bienvenue" }, { type: "stats", items: [] }];
    const result = normalizeSections(raw);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("hero");
  });

  it("drops sections with unrecognized types (e.g. custom_html, timeline — legacy CMS-only types)", () => {
    const raw = [
      { type: "hero", title: "Bienvenue" },
      { type: "custom_html", content: "<div>raw</div>" },
      { type: "timeline", items: [] },
    ];
    const result = normalizeSections(raw);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("hero");
  });

  it("returns an empty array for null/undefined input", () => {
    expect(normalizeSections(null)).toEqual([]);
    expect(normalizeSections(undefined)).toEqual([]);
  });

  it("never mutates the input array", () => {
    const raw = [{ type: "hero", title: "X" }, { type: "unknown_type" }];
    const copy = [...raw];
    normalizeSections(raw);
    expect(raw).toEqual(copy);
  });
});
