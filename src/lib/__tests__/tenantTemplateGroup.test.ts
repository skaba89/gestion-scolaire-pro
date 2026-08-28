/**
 * Audit templates de site public (2026-08-28) : les formulaires de création
 * / édition de tenant (CreateTenant.tsx, TenantSettings.tsx,
 * EstablishmentSettings.tsx, SchoolWizard.tsx) envoient tous tenant.type
 * sous forme courte et minuscule : "school"|"primary"|"middle"|"high"|
 * "university"|"training" — jamais les formes longues historiques
 * ("HIGH_SCHOOL", "SECONDARY_SCHOOL", etc.).
 *
 * getTenantTemplateGroup() ne reconnaissait QUE les formes longues : "high"
 * et "middle" tombaient silencieusement sur le groupe 'default' au lieu de
 * 'highschool' — un lycée ou un collège créé via l'interface standard
 * recevait donc le mauvais template (legacy ET premium, puisque
 * TenantLanding.tsx utilise cette même fonction pour les deux systèmes).
 * Seuls "university" et "primary" fonctionnaient, par coïncidence de
 * casse. Ce test verrouille les vraies valeurs, pas les formes historiques.
 */
import { describe, expect, it } from "vitest";
import {
  getTenantTemplateGroup,
  getTenantTypeLabel,
  getTenantTypeBadgeColor,
} from "@/lib/tenantTemplateGroup";

describe("getTenantTemplateGroup — vraies valeurs de tenant.type", () => {
  it("classe 'high' (lycée) dans le groupe 'highschool'", () => {
    expect(getTenantTemplateGroup("high")).toBe("highschool");
  });

  it("classe 'middle' (collège) dans le groupe 'highschool'", () => {
    expect(getTenantTemplateGroup("middle")).toBe("highschool");
  });

  it("classe 'university' dans le groupe 'university'", () => {
    expect(getTenantTemplateGroup("university")).toBe("university");
  });

  it("classe 'primary' dans le groupe 'primary'", () => {
    expect(getTenantTemplateGroup("primary")).toBe("primary");
  });

  it("classe 'school' (générique) et 'training' (centre de formation) dans 'default'", () => {
    // Aucun des 3 templates spécifiques ne convient à ces deux types —
    // 'default' est le comportement voulu, pas un oubli.
    expect(getTenantTemplateGroup("school")).toBe("default");
    expect(getTenantTemplateGroup("training")).toBe("default");
  });

  it("reste tolérant aux formes longues historiques", () => {
    expect(getTenantTemplateGroup("HIGH_SCHOOL")).toBe("highschool");
    expect(getTenantTemplateGroup("SECONDARY_SCHOOL")).toBe("highschool");
    expect(getTenantTemplateGroup("HIGHER_EDUCATION")).toBe("university");
  });

  it("retombe sur 'default' pour une valeur absente ou inconnue", () => {
    expect(getTenantTemplateGroup(undefined)).toBe("default");
    expect(getTenantTemplateGroup(null)).toBe("default");
    expect(getTenantTemplateGroup("n'importe-quoi")).toBe("default");
  });
});

describe("getTenantTypeLabel / getTenantTypeBadgeColor — mêmes vraies valeurs", () => {
  it("donne un libellé français pour chaque vraie valeur", () => {
    expect(getTenantTypeLabel("university")).toBe("Université");
    expect(getTenantTypeLabel("high")).toBe("Lycée");
    expect(getTenantTypeLabel("middle")).toBe("Collège");
    expect(getTenantTypeLabel("primary")).toBe("École primaire");
    expect(getTenantTypeLabel("school")).toBe("École");
    expect(getTenantTypeLabel("training")).toBe("Centre de formation");
  });

  it("retombe sur 'Établissement' quand le type est absent", () => {
    expect(getTenantTypeLabel(undefined)).toBe("Établissement");
    expect(getTenantTypeLabel(null)).toBe("Établissement");
  });

  it("donne une couleur de badge pour chaque vraie valeur", () => {
    expect(getTenantTypeBadgeColor("university")).toContain("blue");
    expect(getTenantTypeBadgeColor("high")).toContain("purple");
    expect(getTenantTypeBadgeColor("primary")).toContain("green");
    expect(getTenantTypeBadgeColor("training")).toContain("orange");
  });
});
