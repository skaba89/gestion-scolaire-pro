import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import i18n from "@/i18n/config";
import { SubscriptionGate } from "@/components/SubscriptionGate";

const mockUsePlan = vi.fn();
const mockHasRole = vi.fn();

vi.mock("@/hooks/usePlan", () => ({ usePlan: () => mockUsePlan() }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" }, hasRole: mockHasRole, signOut: vi.fn() }),
}));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { slug: "ecole" } }) }));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SubscriptionGate>
        <p>Contenu de la page</p>
      </SubscriptionGate>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("fr");
  mockHasRole.mockImplementation((role: string) => role === "TENANT_ADMIN");
});

afterEach(() => vi.clearAllMocks());

describe("SubscriptionGate", () => {
  it("laisse passer un abonnement actif", () => {
    mockUsePlan.mockReturnValue({ access: "full", readOnlyUntil: null, isLoading: false });
    renderAt("/ecole/admin");
    expect(screen.getByText("Contenu de la page")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("affiche un bandeau en lecture seule, avec la date de fin", () => {
    mockUsePlan.mockReturnValue({ access: "read_only", readOnlyUntil: new Date("2026-12-10T00:00:00"), isLoading: false });
    renderAt("/ecole/admin");
    expect(screen.getByText("Contenu de la page")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("lecture seule jusqu'au 10 décembre 2026");
    expect(screen.getByRole("link", { name: "Renouveler l'abonnement" })).toHaveAttribute("href", "/ecole/admin/billing");
  });

  it("bloque les pages et propose la facturation à l'administrateur", () => {
    mockUsePlan.mockReturnValue({ access: "blocked", readOnlyUntil: null, isLoading: false });
    renderAt("/ecole/admin/students");
    expect(screen.queryByText("Contenu de la page")).toBeNull();
    expect(screen.getByRole("heading", { name: "L'abonnement de votre établissement a expiré" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Renouveler l'abonnement/ })).toHaveAttribute("href", "/ecole/admin/billing");
  });

  it("laisse la page Facturation accessible pendant le blocage", () => {
    mockUsePlan.mockReturnValue({ access: "blocked", readOnlyUntil: null, isLoading: false });
    renderAt("/ecole/admin/billing");
    expect(screen.getByText("Contenu de la page")).toBeInTheDocument();
  });

  it("dit aux autres membres de contacter la direction, sans lien de paiement", () => {
    mockHasRole.mockReturnValue(false);
    mockUsePlan.mockReturnValue({ access: "blocked", readOnlyUntil: null, isLoading: false });
    renderAt("/ecole/teacher");
    expect(screen.getByText(/Contactez la direction/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
