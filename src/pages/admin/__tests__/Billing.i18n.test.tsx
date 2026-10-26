import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import i18n from "@/i18n/config";
import Billing from "@/pages/admin/Billing";

const mockGet = vi.fn();

vi.mock("@/api/client", () => ({
  default: { get: (...args: unknown[]) => mockGet(...args), post: vi.fn() },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Réponses de l'API : noms et descriptions d'offres en français (seed backend).
const API: Record<string, unknown> = {
  "/billing/subscription/": {
    plan: "standard",
    status: "trialing",
    trial_active: true,
    trial_ends_at: "2026-11-25T00:00:00",
    billing_email: "direction@ecole.gn",
    latest_request: null,
  },
  "/billing/plans/": {
    items: [
      { id: "1", slug: "standard", name: "Standard", description: "Jusqu'à 500 élèves ou étudiants — toutes les fonctionnalités.", currency: "EUR", price_monthly: 49.99, price_yearly: 499.9, max_students: 500, max_campuses: 1, features: {} },
      { id: "4", slug: "enterprise", name: "Entreprise", description: "Plusieurs établissements, effectifs illimités — tarification sur devis.", currency: "EUR", price_monthly: 0, price_yearly: 0, max_students: null, max_campuses: null, features: { on_quote: true } },
    ],
  },
};

function renderBilling() {
  mockGet.mockImplementation((url: string) => Promise.resolve({ data: API[url] }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Billing />
    </QueryClientProvider>,
  );
}

afterEach(async () => {
  await i18n.changeLanguage("fr");
});

describe("Facturation — traduction", () => {
  it("s'affiche en anglais, offres du catalogue traduites", async () => {
    await i18n.changeLanguage("en");
    renderBilling();

    expect(await screen.findByText("Billing & Subscription")).toBeInTheDocument();
    expect(screen.getByText("Free trial in progress")).toBeInTheDocument();
    expect(screen.getByText("Enterprise")).toBeInTheDocument();
    expect(screen.getByText("500 students max")).toBeInTheDocument();
    expect(screen.getAllByText("On quote").length).toBeGreaterThan(0);
    const text = document.body.textContent ?? "";
    expect(text).toContain("November 25, 2026");
    expect(text).not.toMatch(/Facturation|Sur devis|Jusqu'à 500/);
  });

  it("reste en français par défaut", async () => {
    await i18n.changeLanguage("fr");
    renderBilling();

    expect(await screen.findByText("Facturation & Abonnement")).toBeInTheDocument();
    expect(screen.getByText("500 élèves max")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nous contacter" })).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:"),
    );
  });
});
