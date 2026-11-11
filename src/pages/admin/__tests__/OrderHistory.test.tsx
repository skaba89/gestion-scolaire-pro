import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";

/**
 * Historique des commandes (2026-11-11) : la corbeille n'avait aucune action
 * (et `DELETE /inventory/orders/{id}/` n'existait pas). Elle annule désormais
 * la vente (confirmation, statut « Annulée », articles remis en stock côté
 * serveur) ; une vente annulée ne peut plus l'être une seconde fois.
 */

const { cancelOrder, success, error, orders } = vi.hoisted(() => ({
  cancelOrder: vi.fn(), success: vi.fn(), error: vi.fn(),
  orders: [
    { id: "order-aaaa-1", created_at: "2026-11-10T09:00:00", payment_method: "CASH", total_amount: 16000, status: "COMPLETED",
      student: { first_name: "Awa", last_name: "Bah", registration_number: "M-1" } },
    { id: "order-bbbb-2", created_at: "2026-11-09T09:00:00", payment_method: "CASH", total_amount: 5000, status: "CANCELLED", student: null },
  ],
}));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { id: "tenant-1" } }) }));
vi.mock("@/hooks/useCurrency", () => ({ useCurrency: () => ({ formatCurrency: (n: number) => `${n} GNF` }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { success, error } }));
vi.mock("@/components/admin/orders/OrderReceipt", () => ({ OrderReceipt: () => null }));
vi.mock("@/queries/admin", () => ({ adminQueries: {
  orders: () => ({ queryKey: ["admin-orders", "tenant-1"], queryFn: async () => orders }),
  orderItems: () => ({ queryKey: ["items"], queryFn: async () => [] }),
  cancelOrder,
} }));
import OrderHistory from "../OrderHistory";

beforeEach(() => { vi.clearAllMocks(); cancelOrder.mockResolvedValue({ status: "CANCELLED" }); });

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><OrderHistory /></QueryClientProvider>);
}

it("annule une vente après confirmation", async () => {
  setup();
  const row = (await screen.findByText("Bah Awa")).closest("tr")!;
  fireEvent.click(within(row).getByRole("button", { name: "orderHistory.cancelSale" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText("orderHistory.cancelDescription")).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "orderHistory.cancelConfirm" }));
  await waitFor(() => expect(cancelOrder).toHaveBeenCalledWith("order-aaaa-1"));
  await waitFor(() => expect(success).toHaveBeenCalledWith("orderHistory.cancelSuccess"));
});

it("affiche une vente annulée comme telle et ne propose plus de l'annuler", async () => {
  setup();
  const row = (await screen.findByText("orderHistory.anonymousClient")).closest("tr")!;
  expect(within(row).getByText("orderHistory.statusCancelled")).toBeInTheDocument();
  expect(within(row).getByRole("button", { name: "orderHistory.cancelSale" })).toBeDisabled();
});
