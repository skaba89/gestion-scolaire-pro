import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Grades from "@/pages/admin/Grades";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/api/client", () => ({ apiClient: api }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { id: "tenant-a" } }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ roles: ["TENANT_ADMIN"] }) }));
vi.mock("@/hooks/useTenantNavigate", () => ({ useTenantNavigate: () => vi.fn() }));
vi.mock("@/hooks/useEducationModules", () => ({ useEducationModules: () => ({ isModuleEnabled: () => true }) }));
vi.mock("@/queries/exam-sessions", () => ({ useExamSessions: () => ({ data: [{
  id: "session-1", semester_id: "semester-1", code: "RATTRAPAGE-S1", name: "Rattrapage S1",
  status: "OPEN", session_type: "RETAKE", selection_policy: "BEST", revision: 2,
}] }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => ({
  "grades.newAssessment": "Nouvelle évaluation", "grades.assessmentName": "Nom",
  "grades.classes": "Classes", "grades.subject": "Matière", "grades.choose": "Choisir",
  "grades.termSemester": "Période", "grades.date": "Date", "grades.colMaxScore": "Note max",
  "grades.coefficient": "Coefficient", "grades.createAssessment": "Créer",
  "common.cancel": "Annuler", "grades.pageTitle": "Notes", "grades.pageSubtitle": "Gestion",
  "grades.generateBulletins": "Bulletins", "grades.assessments": "Évaluations",
  "grades.subjects": "Matières", "grades.periods": "Périodes", "grades.searchPlaceholder": "Rechercher",
  "grades.lmdSession": "Session LMD", "grades.lmdExamSession": "Session d'examen LMD",
  "grades.outsideSession": "Hors session",
  "grades.closedSessionHint": "Une session clôturée disparaît de la sélection et son historique devient immuable.",
  "grades.allClasses": "Toutes", "grades.noAssessmentFound": "Aucune", "grades.noAssessmentSub": "",
  "grades.configRequired": "Configuration", "grades.configRequiredText": "À compléter",
  "grades.configSubjects": "Matières", "grades.configClasses": "Classes", "grades.configTerms": "Périodes",
  "grades.colAssessment": "Évaluation", "grades.type": "Type", "common.loading": "Chargement",
}[key] || key) }) }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value?: string; onValueChange?: (value: string) => void; children: ReactNode }) =>
    <select value={value} onChange={event => onValueChange?.(event.target.value)}>{children}</select>,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
}));

describe("rattachement d'une évaluation à une session LMD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((url: string) => Promise.resolve({ data:
      url.includes("classrooms") ? [{ id: "class-1", name: "L1" }] :
      url.includes("subjects") ? [{ id: "subject-1", name: "Algorithmique", semester_id: "semester-1" }] :
      url.includes("terms") ? [] : { items: [] },
    }));
  });

  it("ne propose que les sessions ouvertes du semestre de la matière", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><Grades /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Nouvelle évaluation" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Nouvelle évaluation" }));
    await waitFor(() => expect(screen.getByText("Algorithmique")).toBeInTheDocument());
    const subjectOption = screen.getByText("Algorithmique") as HTMLOptionElement;
    fireEvent.change(subjectOption.closest("select")!, { target: { value: "subject-1" } });
    expect(screen.getByText("Session d'examen LMD")).toBeInTheDocument();
    expect(screen.getByText(/RATTRAPAGE-S1 — Rattrapage S1 \(OPEN\)/)).toBeInTheDocument();
  });
});
