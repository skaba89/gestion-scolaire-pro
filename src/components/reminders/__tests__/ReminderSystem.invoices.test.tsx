import "@/i18n/config";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";

/**
 * Régression R1 (recette E2E 09) : GET /invoices/ renvoie une page
 * { items, total, ... }. ReminderSystem la traitait comme un tableau
 * (« invoiceData.forEach is not a function ») et faisait planter tout le
 * portail parent dès qu'un enfant était rattaché.
 */

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/api/client", () => ({ apiClient: { get } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "parent-1" }, roles: ["PARENT"] }) }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { id: "tenant-1" } }) }));
vi.mock("@/hooks/useTenantUrl", () => ({ useTenantUrl: () => ({ getTenantUrl: (p: string) => `/uls${p}` }) }));
vi.mock("@/hooks/useCurrency", () => ({ useCurrency: () => ({ currency: { symbol: "GNF" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { ReminderSystem, remainingAmount } from "../ReminderSystem";

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().split("T")[0];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  get.mockImplementation((url: string) => {
    if (url === "/invoices/") {
      return Promise.resolve({ data: {
        items: [
          { id: "i1", invoice_number: "FAC-001", status: "OVERDUE", due_date: day(-5),
            total_amount: "1500000.00", paid_amount: "500000.00",
            students: { first_name: "Aissatou", last_name: "Diallo" } },
          { id: "i2", invoice_number: "FAC-002", status: "PAID", due_date: day(-2),
            total_amount: 800000, paid_amount: 800000, students: { first_name: "Aissatou", last_name: "Diallo" } },
          { id: "i3", invoice_number: "FAC-003", status: "PARTIAL", due_date: day(2),
            total_amount: 300000, paid_amount: 100000, students: { first_name: "Aissatou", last_name: "Diallo" } },
        ],
        total: 3, page: 1, page_size: 100, pages: 1,
      } });
    }
    // Lien parent-enfant réel : c'est ce qui menait l'ancien code jusqu'au
    // .forEach sur la page de factures.
    if (url === "/student-parents/") return Promise.resolve({ data: [{ student_id: "s1" }] });
    if (url === "/students/") return Promise.resolve({ data: { items: [] } });
    if (url === "/school-events/") return Promise.resolve({ data: [] });
    return Promise.reject(new Error(`URL inattendue ${url}`));
  });
});

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><ReminderSystem /></QueryClientProvider>);
}

it("affiche les factures impayées d'une réponse paginée sans planter", async () => {
  setup();
  expect(await screen.findByText("Facture FAC-001")).toBeInTheDocument();
  expect(screen.getByText(/1\s000\s000 GNF/)).toBeInTheDocument();
  expect(screen.getByText("Facture FAC-003")).toBeInTheDocument();
  expect(screen.queryByText("Facture FAC-002")).not.toBeInTheDocument();

  const invoiceCalls = get.mock.calls.filter(([url]) => url === "/invoices/");
  expect(invoiceCalls).toHaveLength(1);
  // Le serveur restreint lui-même aux enfants du parent : plus de paramètres
  // ignorés (student_id__in, status__in) ni d'appel préalable aux liens.
  expect(invoiceCalls[0][1]).toEqual({ params: { page_size: 100 } });
  expect(get.mock.calls.some(([url]) => url === "/student-parents/")).toBe(false);
});

it("ne plante pas si la page de factures est vide ou sans items", async () => {
  get.mockImplementation((url: string) =>
    Promise.resolve({ data: url === "/invoices/" ? {} : url === "/school-events/" ? [] : { items: [] } }));
  setup();
  await waitFor(() => expect(get.mock.calls.some(([url]) => url === "/invoices/")).toBe(true));
  expect(await screen.findByText("Aucun rappel pour le moment")).toBeInTheDocument();
});

it("calcule le reste à payer depuis des montants décimaux en chaîne", () => {
  expect(remainingAmount({ total_amount: "1500000.00", paid_amount: "500000.00" })).toBe(1_000_000);
  expect(remainingAmount({ total_amount: null, paid_amount: null })).toBe(0);
});
