/**
 * ANALYTICS-ZERO-01 (2026-11-23) : un indicateur indisponible (503) est signalé comme tel.
 * Avant : le tableau de bord remplaçait chaque échec par des zéros (« 0 élève », graphiques
 * vides), indiscernables d'un établissement réellement vide.
 */
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock("@/api/client", () => ({ apiClient: { get: mockGet } }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { id: "tenant-1" } }) }));
vi.mock("@/hooks/useCurrency", () => ({
  useCurrency: () => ({ formatCurrency: (v: number) => `${v}`, formatCurrencyCompact: (v: number) => `${v}` }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { dashboardQueries } from "@/queries/dashboard";
import { RevenueTrendChart } from "@/components/dashboard/widgets/RevenueTrendChart";

function unavailable() {
  return Object.assign(new Error("Request failed with status code 503"), {
    response: { status: 503, data: { detail: "Indicateur indisponible : réessayez plus tard." } },
  });
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("indicateurs indisponibles", () => {
  beforeEach(() => mockGet.mockReset());

  it("les statistiques du tableau de bord échouent au lieu de renvoyer des zéros", async () => {
    mockGet.mockImplementation((url: string) =>
      url === "/analytics/academic-kpis/" ? Promise.reject(unavailable()) : Promise.resolve({ data: {} }),
    );

    await expect(dashboardQueries.stats("tenant-1").queryFn()).rejects.toThrow("503");
  });

  it("les graphiques du tableau de bord échouent au lieu de rester vides", async () => {
    mockGet.mockImplementation((url: string) =>
      url === "/analytics/operational-kpis/" ? Promise.reject(unavailable()) : Promise.resolve({ data: { byClass: [] } }),
    );

    await expect(dashboardQueries.chartData("tenant-1").queryFn()).rejects.toThrow("503");
  });

  it("un widget affiche « indisponible » et permet de réessayer", async () => {
    mockGet.mockRejectedValueOnce(unavailable());
    const user = userEvent.setup();

    render(<RevenueTrendChart />, { wrapper });

    expect(await screen.findByRole("alert")).toHaveTextContent("dashboard.analyticsUnavailable.title");
    expect(screen.queryByText(/0\b/)).not.toBeInTheDocument();

    mockGet.mockResolvedValueOnce({ data: [{ period: "2026-10", revenue: 1000, paid: 800, pending: 200 }] });
    await user.click(screen.getByRole("button", { name: "dashboard.analyticsUnavailable.retry" }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
