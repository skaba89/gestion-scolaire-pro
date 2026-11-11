import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
// L'onglet Analyse reçoit les props officielles : on les expose pour les vérifier.
vi.mock("@/components/reports/PerformanceAnalytics", () => ({
  PerformanceAnalytics: (props: { averages: number[]; passingGrade: number; subjects: { subject_name: string }[] }) => (
    <div data-testid="analytics-props">{JSON.stringify({
      averages: props.averages, passingGrade: props.passingGrade, subjects: props.subjects.map((s) => s.subject_name),
    })}</div>
  ),
}));
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
    if (url === "/school-life/report-cards/class-summary/") {
      expect(config?.params).toEqual({ classroom_id: CLASS_ID, term_id: "term-1" });
      return Promise.resolve({ data: { class_total: 2, passing_grade: 12, items: [
        { student_id: "s-old", average: "14.25", rank: 1, color: "#1d4ed8" },
        { student_id: "s-new", average: null, rank: 0, color: null },
      ], subjects: [
        { subject_id: "m1", subject_name: "Microéconomie", coefficient: 2, class_average: 14.25, best_average: 14.25, graded_students: 1 },
      ] } });
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
  // Valeurs officielles du serveur (période choisie), pas un recalcul local
  // des notes brutes (12/20 toutes périodes confondues ici).
  await waitFor(() => expect(oldRow).toHaveTextContent("14.25/20"));
  expect(oldRow).toHaveTextContent("1e/2");
  expect(oldRow).not.toHaveTextContent("12.00");
  const newRow = screen.getByText("RECENT-002").closest("tr")!;
  expect(newRow).toHaveTextContent("—");
  expect(screen.getAllByText("RECENT-002")).toHaveLength(1);
  expect(screen.queryByText("AUTRE-003")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByText(/Tous les bulletins \(2\)/)).toBeInTheDocument());
  expect(get.mock.calls.some(([url]) => url === "/students/")).toBe(false);
  // Pas de requête de notes par élève tant que l'onglet Analyse est fermé.
  expect(get.mock.calls.some(([url]) => url === "/grades/")).toBe(false);
});

it("signale l'échec de la synthèse officielle au lieu d'afficher des moyennes vides", async () => {
  const base = get.getMockImplementation()!;
  get.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) =>
    url === "/school-life/report-cards/class-summary/"
      ? Promise.reject(new Error("500"))
      : base(url, config));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><ReportCards /></QueryClientProvider>);

  expect(await screen.findByRole("alert")).toHaveTextContent("moyennes et rangs officiels");
  expect(screen.getByText("ANCIEN-001")).toBeInTheDocument();
});

// L'onglet Analyse recalculait dans le navigateur à partir de TOUTES les
// notes (N requêtes /grades/, toutes périodes, seuil 10 en dur). Il reçoit
// désormais les valeurs officielles de la période, sans aucune requête de notes.
it("l'onglet Analyse utilise la synthèse officielle de la période, sans requête de notes", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><ReportCards /></QueryClientProvider>);
  await screen.findByText("ANCIEN-001");

  const tab = screen.getByRole("tab", { name: /Analyse des résultats/ });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);

  const props = JSON.parse((await screen.findByTestId("analytics-props")).textContent!);
  expect(props).toEqual({ averages: [14.25], passingGrade: 12, subjects: ["Microéconomie"] });
  expect(get.mock.calls.some(([url]) => url === "/grades/")).toBe(false);
});

// Les couleurs de moyenne étaient calculées ici avec 10/14 en dur (vert dès
// 14) alors que les règles académiques sont réglables par niveau. La page
// affiche désormais la couleur calculée par le serveur (règles du niveau,
// même couleur que le bulletin PDF) : ici 14,25 reste bleu car « Bien » est
// plus haut pour ce niveau.
it("colore la moyenne avec la couleur officielle du serveur, pas des seuils en dur", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><ReportCards /></QueryClientProvider>);
  const avg = (await screen.findByText("14.25")).closest("span")!;
  expect(avg).toHaveStyle({ color: "#1d4ed8" });
});
