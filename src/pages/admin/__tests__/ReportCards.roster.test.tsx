import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Régression REPORT-CARDS-ROSTER-01 : la liste des bulletins d'une classe était
 * croisée avec GET /students/?page_size=100 (100 élèves les plus récents de
 * l'établissement). Un inscrit plus ancien disparaissait de la liste et du
 * compteur « Tous les bulletins », sans erreur. Le roster doit venir des
 * inscriptions de la classe, qui embarquent déjà l'élève.
 */

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/api/client", () => ({ apiClient: { get, post: vi.fn() } }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { id: "tenant-1" } }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useStudentLabel", () => ({
  useStudentLabel: () => ({ studentLabel: "élève", studentsLabel: "élèves", StudentsLabel: "Élèves" }),
}));
vi.mock("@/components/reports/PerformanceAnalytics", () => ({ PerformanceAnalytics: () => null }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
import ReportCards from "../ReportCards";

const CLASS_ID = "class-1";
const brief = (id: string, last: string, reg: string) =>
  ({ id, first_name: "Prénom", last_name: last, registration_number: reg });

beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
    if (url === "/terms/") return Promise.resolve({ data: [{ id: "term-1", name: "Semestre 1" }] });
    if (url === "/infrastructure/classrooms/") return Promise.resolve({ data: [{ id: CLASS_ID, name: "L1 Économie" }] });
    if (url === "/infrastructure/enrollments/") {
      return Promise.resolve({ data: [
        { id: "e1", class_id: CLASS_ID, student_id: "s-old", student: brief("s-old", "Camara", "ANCIEN-001") },
        { id: "e2", class_id: CLASS_ID, student_id: "s-new", student: brief("s-new", "Diallo", "RECENT-002") },
        // Doublon historique d'inscription active (cf. #480) : un seul bulletin.
        { id: "e3", class_id: CLASS_ID, student_id: "s-new", student: brief("s-new", "Diallo", "RECENT-002") },
        // Inscription d'une autre classe renvoyée par erreur : ignorée.
        { id: "e4", class_id: "class-2", student_id: "s-other", student: brief("s-other", "Bah", "AUTRE-003") },
      ] });
    }
    if (url === "/grades/") {
      return Promise.resolve({ data: { items: config?.params?.student_id === "s-old"
        ? [{ student_id: "s-old", subject_name: "Microéconomie", score: 12, max_score: 20, coefficient: 1 }]
        : [] } });
    }
    // Simule l'ancienne source tronquée : seul l'élève récent figure en page 1.
    if (url === "/students/") return Promise.resolve({ data: { items: [brief("s-new", "Diallo", "RECENT-002")] } });
    return Promise.reject(new Error(`URL inattendue ${url}`));
  });
});

it("liste tous les inscrits de la classe, même absents de la première page de /students/", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><ReportCards /></QueryClientProvider>);

  const oldRow = (await screen.findByText("ANCIEN-001")).closest("tr")!;
  expect(oldRow).toHaveTextContent("Camara");
  expect(oldRow).toHaveTextContent("12.00/20");
  expect(screen.getAllByText("RECENT-002")).toHaveLength(1);
  expect(screen.queryByText("AUTRE-003")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByText(/Tous les bulletins \(2\)/)).toBeInTheDocument());
  expect(get.mock.calls.some(([url]) => url === "/students/")).toBe(false);
});
