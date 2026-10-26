import { afterEach, beforeAll, describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import i18n from "@/i18n/config";
import { formatEur, hasPlanAccess, planLabel, PUBLIC_PLANS } from "@/lib/pricing";
import Pricing from "@/pages/public/Pricing";
import { PlanGate } from "@/components/ui/PlanGate";

const mockUsePlan = vi.fn();

vi.mock("@/hooks/usePlan", () => ({
  usePlan: () => mockUsePlan(),
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { slug: "ecole-test" } }),
}));

beforeAll(async () => {
  await i18n.changeLanguage("fr");
});

afterEach(async () => {
  await i18n.changeLanguage("fr");
});

describe("grille tarifaire (2026-10-26)", () => {
  it("affiche les prix décidés, en euros", () => {
    expect(PUBLIC_PLANS.map((p) => [p.slug, p.priceMonthly])).toEqual([
      ["standard", 49.99],
      ["medium", 99.99],
      ["premium", 499.99],
      ["enterprise", null],
    ]);
    expect(formatEur(49.99).replace(/\s/g, " ")).toBe("49,99 €");
  });

  it("traduit les noms d'offres et signale les anciennes", () => {
    expect(planLabel(i18n.t, "enterprise")).toBe("Entreprise");
    expect(planLabel(i18n.t, "starter")).toBe("Starter (ancienne offre)");
    expect(planLabel(i18n.t, "inconnue")).toBe("inconnue");
  });

  it("n'accorde rien à une offre gratuite ou inconnue", () => {
    expect(hasPlanAccess("starter", "standard")).toBe(false);
    expect(hasPlanAccess("free", "standard")).toBe(false);
    expect(hasPlanAccess(undefined, "standard")).toBe(false);
    for (const plan of ["standard", "medium", "premium", "enterprise", "pro"]) {
      expect(hasPlanAccess(plan, "standard")).toBe(true);
    }
  });

  it("la page Tarifs montre les 4 offres, l'essai et la mention GNF, sans offre gratuite", () => {
    render(
      <MemoryRouter>
        <Pricing />
      </MemoryRouter>,
    );
    for (const name of ["Standard", "Medium", "Premium", "Entreprise"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    const text = document.body.textContent?.replace(/\s/g, " ") ?? "";
    expect(text).toContain("49,99 €");
    expect(text).toContain("99,99 €");
    expect(text).toContain("499,99 €");
    expect(text).toContain("Sur devis");
    expect(text).toMatch(/GNF\) au taux du jour/);
    expect(text).not.toMatch(/Gratuit\b|pour toujours|Starter/);
    const enterprise = screen.getByRole("heading", { name: "Entreprise" }).closest("div")!.parentElement!;
    expect(within(enterprise).getByRole("link", { name: /Nous contacter/ })).toHaveAttribute(
      "href",
      expect.stringMatching(/^mailto:/),
    );
  });
});

describe("PlanGate", () => {
  beforeEach(() => mockUsePlan.mockReset());

  it("bloque un établissement sans abonnement actif et renvoie vers ses offres", () => {
    mockUsePlan.mockReturnValue({ hasAccess: () => false, isLoading: false });
    render(
      <MemoryRouter>
        <PlanGate minPlan="standard">
          <p>Import</p>
        </PlanGate>
      </MemoryRouter>,
    );
    expect(screen.queryByText("Import")).toBeNull();
    expect(screen.getByRole("link", { name: /Voir les offres/ })).toHaveAttribute("href", "/ecole-test/admin/billing");
  });

  it("laisse passer un établissement abonné", () => {
    mockUsePlan.mockReturnValue({ hasAccess: () => true, isLoading: false });
    render(
      <MemoryRouter>
        <PlanGate minPlan="standard">
          <p>Import</p>
        </PlanGate>
      </MemoryRouter>,
    );
    expect(screen.getByText("Import")).toBeInTheDocument();
  });
});

describe("page Tarifs en anglais", () => {
  it("affiche la grille traduite, prix au format anglais", async () => {
    await i18n.changeLanguage("en");
    render(
      <MemoryRouter>
        <Pricing />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Enterprise" })).toBeInTheDocument();
    expect(screen.getByText("Frequently asked questions")).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    expect(text).toContain("€49.99");
    expect(text).toContain("30-day trial");
    expect(text).not.toMatch(/Sur devis|Questions fréquentes/);
  });
});
