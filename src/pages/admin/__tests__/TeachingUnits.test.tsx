import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TeachingUnits from "@/pages/admin/TeachingUnits";

const state = vi.hoisted(() => ({
  roles: ["TENANT_ADMIN"],
  create: vi.fn(), update: vi.fn(), updateRules: vi.fn(),
  validation: {
    revision: 3,
    effective_ecue_pass_grade: 10,
    rules: {
      intra_ue_compensation_enabled: false,
      semester_compensation_enabled: false,
      semester_pass_grade: 10,
      minimum_compensable_ue_grade: 5,
      require_all_ecues_graded: true,
    },
  },
}));

vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { id: "tenant-a" } }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ roles: state.roles }) }));
vi.mock("@/queries/semesters", () => ({ useSemesters: () => ({ data: [{ id: "s1", name: "Semestre 1" }] }) }));
vi.mock("@/queries/teaching-units", () => ({
  useTeachingUnits: () => ({ data: [
    { id: "ue1", tenant_id: "tenant-a", semester_id: "s1", code: "UE-INF", name: "Informatique", ects: 6, is_active: true, revision: 2, subject_count: 2, assigned_ects: 6, ects_consistent: true },
    { id: "ue2", tenant_id: "tenant-a", semester_id: "s1", code: "UE-HIST", name: "Historique", ects: 3, is_active: false, revision: 3, subject_count: 1, assigned_ects: 2, ects_consistent: false },
  ], isLoading: false }),
  useCreateTeachingUnit: () => ({ mutateAsync: state.create, isPending: false }),
  useUpdateTeachingUnit: () => ({ mutateAsync: state.update, isPending: false }),
  useLmdValidationRules: (_tenantId: string, allowed: boolean) => ({ data: allowed ? state.validation : undefined }),
  useUpdateLmdValidationRules: () => ({ mutate: state.updateRules, isPending: false }),
}));

describe("administration des UE", () => {
  beforeEach(() => { vi.clearAllMocks(); state.roles = ["TENANT_ADMIN"]; });

  it("affiche la cohérence ECTS et conserve les UE archivées", () => {
    render(<TeachingUnits />);
    expect(screen.getByText("UE-INF — Informatique")).toBeInTheDocument();
    expect(screen.getByText("Crédits cohérents")).toBeInTheDocument();
    expect(screen.getByText("Crédits à équilibrer")).toBeInTheDocument();
    expect(screen.getByText("Archivée — historique conservé")).toBeInTheDocument();
  });

  it("ouvre la création pour un administrateur et reste en lecture seule sinon", () => {
    const view = render(<TeachingUnits />);
    fireEvent.click(screen.getByRole("button", { name: /Nouvelle UE/i }));
    expect(screen.getByRole("heading", { name: "Nouvelle UE" })).toBeInTheDocument();
    view.unmount();
    state.roles = ["TEACHER"];
    render(<TeachingUnits />);
    expect(screen.queryByRole("button", { name: /Nouvelle UE/i })).toBeNull();
  });

  it("enregistre une configuration LMD versionnée", () => {
    render(<TeachingUnits />);
    fireEvent.click(screen.getByLabelText("Compensation au sein de l'UE"));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les règles" }));
    expect(state.updateRules).toHaveBeenCalledWith({
      expected_revision: 3,
      rules: expect.objectContaining({ intra_ue_compensation_enabled: true }),
    });
  });

  it("n'expose pas la configuration aux rôles sans settings:read", () => {
    state.roles = ["DEPARTMENT_HEAD"];
    render(<TeachingUnits />);
    expect(screen.queryByText("Règles de validation LMD")).toBeNull();
  });
});
