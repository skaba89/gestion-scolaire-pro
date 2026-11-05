import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const { get, getGrades, generateReportCard, success, error, createUrl, revokeUrl } = vi.hoisted(() => ({
  get: vi.fn(), getGrades: vi.fn(), generateReportCard: vi.fn(), success: vi.fn(), error: vi.fn(),
  createUrl: vi.fn(), revokeUrl: vi.fn(),
}));
vi.mock("@/api/client", () => ({ apiClient: { get } }));
vi.mock("@/features/parents/services/parentsService", () => ({ parentsService: { getGrades, generateReportCard } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "parent-1" } }) }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { id: "tenant-1" } }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { success, error } }));
vi.mock("@/features/parents/hooks/useParentData", () => ({ useParentData: () => ({
  children: [{ student_id: "s1", student: { first_name: "Awa", last_name: "Bah", date_of_birth: "2012-01-01" } }],
  studentIds: ["s1"], isLoading: false, queries: { dashboard: { isError: false } },
}) }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: ReactNode }) =>
    <select value={value} onChange={event => onValueChange(event.target.value)}>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));
import ReportCards from "../ReportCards";

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: [{ id: "term-1", name: "Semestre 1", start_date: "2025-09-01", end_date: "2026-01-31", academic_year: { name: "2025-2026" } }] });
  getGrades.mockResolvedValue([{ id: "g1", score: 15, max_score: 20, student_id: "s1", students: { first_name: "Awa", last_name: "Bah" },
    assessments: { name: "Examen", date: "2026-05-01", term_id: "term-1", max_score: 20,
      subjects: { name: "Maths" }, terms: { id: "term-1", name: "Semestre 1" } } }]);
  generateReportCard.mockResolvedValue(new Blob(["%PDF-test"], { type: "application/pdf" }));
  createUrl.mockReturnValue("blob:bulletin");
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createUrl });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeUrl });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><ReportCards /></QueryClientProvider>);
}
async function selectPeriod() {
  const inputs = await screen.findAllByRole("combobox");
  await screen.findByRole("option", { name: /Semestre 1/ });
  fireEvent.change(inputs[0], { target: { value: "s1" } });
  fireEvent.change(inputs[1], { target: { value: "term-1" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "parentReportCards.generatePdf" })).toBeEnabled());
}

it("télécharge le PDF du serveur sans inscription ni notes recalculées dans le navigateur", async () => {
  setup();
  await selectPeriod();
  fireEvent.click(screen.getByRole("button", { name: "parentReportCards.generatePdf" }));
  await waitFor(() => expect(success).toHaveBeenCalled());
  expect(generateReportCard).toHaveBeenCalledExactlyOnceWith("s1", "term-1");
  expect(createUrl).toHaveBeenCalled();
  expect(revokeUrl).toHaveBeenCalledWith("blob:bulletin");
  expect(get.mock.calls.every(call => call[0] === "/parents/terms/")).toBe(true);
});

it("filtre les notes par identifiant de période, même si l'évaluation est datée en dehors", async () => {
  setup();
  await selectPeriod();
  await waitFor(() => expect(getGrades).toHaveBeenLastCalledWith(["s1"], "s1", "term-1"));
  expect(screen.getByText("Examen")).toBeInTheDocument();
});

it("affiche l'échec de lecture au lieu d'un faux état sans notes", async () => {
  getGrades.mockRejectedValue(new Error("HTTP 503"));
  setup();
  expect(await screen.findByRole("alert")).toHaveTextContent("common.error");
  expect(screen.queryByText("parentReportCards.noGradesAvailable")).not.toBeInTheDocument();
});

it("n'annonce aucun téléchargement réussi lorsque le serveur refuse le bulletin", async () => {
  generateReportCard.mockRejectedValue(new Error("HTTP 403"));
  setup();
  await selectPeriod();
  fireEvent.click(screen.getByRole("button", { name: "parentReportCards.generatePdf" }));
  await waitFor(() => expect(error).toHaveBeenCalled());
  expect(success).not.toHaveBeenCalled();
  expect(createUrl).not.toHaveBeenCalled();
});
