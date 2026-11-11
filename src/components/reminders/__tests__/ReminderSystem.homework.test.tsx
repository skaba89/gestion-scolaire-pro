import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";

/**
 * Régression R6 : les rappels de devoirs lisaient GET /students/ (paginé, et
 * refusé à l'élève) comme un tableau, puis /enrollments/ et /homework/ avec
 * des filtres inexistants : ils restaient toujours vides, sans erreur.
 * Source correcte : GET /students/dashboard/ (devoirs à venir de la classe de
 * l'élève), la même requête que l'accueil et la page Devoirs de l'élève.
 */

const { get, auth } = vi.hoisted(() => ({
  get: vi.fn(),
  auth: { user: { id: "user-1" }, roles: ["STUDENT"] as string[] },
}));
vi.mock("@/api/client", () => ({ apiClient: { get } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { id: "tenant-1" } }) }));
vi.mock("@/hooks/useTenantUrl", () => ({ useTenantUrl: () => ({ getTenantUrl: (p: string) => `/uls${p}` }) }));
vi.mock("@/hooks/useCurrency", () => ({ useCurrency: () => ({ currency: { symbol: "GNF" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { ReminderSystem } from "../ReminderSystem";

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().split("T")[0];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  auth.roles = ["STUDENT"];
  get.mockImplementation((url: string) => {
    if (url === "/students/dashboard/") {
      return Promise.resolve({ data: {
        student: { id: "s1" },
        enrollment: { class_id: "c1" },
        homework: [
          { id: "h1", title: "Exercices de géométrie", due_date: day(1), subject_name: "Mathématiques" },
          { id: "h2", title: "Dissertation", due_date: day(20), subject_name: "Français" },
        ],
        grades: [], schedule: [], checkInHistory: [], submissions: [],
      } });
    }
    if (url === "/school-events/") return Promise.resolve({ data: [] });
    return Promise.reject(new Error(`URL inattendue ${url}`));
  });
});

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><ReminderSystem /></QueryClientProvider>);
}

it("affiche les devoirs proches de l'élève depuis son tableau de bord", async () => {
  setup();
  expect(await screen.findByText("Exercices de géométrie")).toBeInTheDocument();
  expect(screen.getByText("Mathématiques - À rendre")).toBeInTheDocument();
  // Échéance au-delà du délai de rappel (3 jours par défaut) : pas de rappel.
  expect(screen.queryByText("Dissertation")).not.toBeInTheDocument();
  // Plus aucun appel aux anciennes routes au contrat incompatible.
  const urls = get.mock.calls.map(([url]) => url);
  expect(urls).not.toContain("/students/");
  expect(urls).not.toContain("/enrollments/");
  expect(urls).not.toContain("/homework/");
});

it("n'appelle pas le tableau de bord élève pour un parent", async () => {
  auth.roles = ["PARENT"];
  get.mockImplementation((url: string) =>
    Promise.resolve({ data: url === "/invoices/" ? { items: [] } : [] }));
  setup();
  expect(await screen.findByText("Aucun rappel pour le moment")).toBeInTheDocument();
  await waitFor(() => expect(get.mock.calls.some(([url]) => url === "/invoices/")).toBe(true));
  expect(get.mock.calls.some(([url]) => url === "/students/dashboard/")).toBe(false);
});
