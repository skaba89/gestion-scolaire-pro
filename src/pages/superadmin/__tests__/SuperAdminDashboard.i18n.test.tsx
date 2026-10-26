import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import i18n from "@/i18n/config";
import SuperAdminDashboard from "@/pages/superadmin/SuperAdminDashboard";

const mockGet = vi.fn();

vi.mock("@/api/client", () => ({
  apiClient: { get: (...args: unknown[]) => mockGet(...args), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ hasRole: (role: string) => role === "SUPER_ADMIN" }),
}));

const TENANT = {
  id: "t1", name: "École <strong>A</strong> & B", slug: "ecole-ab", type: "primary", is_active: true,
  email: "a@ecole.gn", phone: null, address: null, website: null, created_at: "2026-10-01T09:30:00",
  student_count: 120, user_count: 14, admin_count: 2, subscription_plan: "starter", subscription_status: "trialing",
};

function renderPage() {
  mockGet.mockResolvedValue({ data: [TENANT] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SuperAdminDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(async () => {
  await i18n.changeLanguage("fr");
});

describe("SuperAdminDashboard — traduction", () => {
  it("s'affiche en anglais (types, offres, statuts)", async () => {
    await i18n.changeLanguage("en");
    renderPage();

    expect(await screen.findByText("Institutions (1)")).toBeInTheDocument();
    expect(screen.getByText("Primary school")).toBeInTheDocument();
    expect(screen.getByText("Starter (former plan)")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Subscription" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Établissements|Abonnement|École primaire/);
  });

  it("n'interprète pas le nom d'établissement comme du balisage", async () => {
    await i18n.changeLanguage("fr");
    renderPage();
    await screen.findByText("Établissements (1)");

    fireEvent.click(screen.getByTitle("Désactiver l'établissement"));
    const dialog = await screen.findByRole("dialog");
    const strong = within(dialog).getAllByText((_, el) => el?.tagName === "STRONG" && el.textContent === TENANT.name);
    expect(strong.length).toBeGreaterThan(0);
    // Aucun <strong> imbriqué issu du nom : la balise reste du texte.
    expect(dialog.querySelector("strong strong")).toBeNull();
  });
});
