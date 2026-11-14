import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EducationCycleSettings } from "@/components/settings/EducationCycleSettings";

const state = vi.hoisted(() => ({
  roles: ["TENANT_ADMIN"],
  get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(),
}));

vi.mock("@/api/client", () => ({ apiClient: { get: state.get, post: state.post, put: state.put, patch: state.patch } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ roles: state.roles }) }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { id: "school", slug: "school" } }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/useEducationModules", () => ({
  useEducationCatalog: () => ({ data: { profiles: [
    { id: "primary", period_type: "TRIMESTER" },
    { id: "middle", period_type: "TRIMESTER" },
    { id: "mixed", period_type: "PER_CYCLE" },
  ] } }),
}));

const cycles = [{
  id: "cycle-a", code: "A", name: "Primaire", institution_type: "primary",
  period_type: "TRIMESTER", order_index: 1, is_active: true, revision: 4,
  level_ids: ["level-1"], cycle_policy_available: false,
}, {
  id: "cycle-b", code: "B", name: "Collège", institution_type: "middle",
  period_type: "TRIMESTER", order_index: 2, is_active: true, revision: 2,
  level_ids: ["level-2"], cycle_policy_available: false,
}];
const levels = [
  { id: "level-1", name: "1ère année", order_index: 1, cycle_id: "cycle-a" },
  { id: "level-2", name: "7e année", order_index: 2, cycle_id: "cycle-b" },
  { id: "level-3", name: "Niveau libre", order_index: 3, cycle_id: null },
];

function mount() {
  return render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><EducationCycleSettings /></QueryClientProvider></MemoryRouter>);
}

describe("administration des cycles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.roles = ["TENANT_ADMIN"];
    state.get.mockImplementation((url: string) => Promise.resolve({ data: url === "/levels/" ? levels : cycles }));
    state.post.mockResolvedValue({ data: {} });
    state.put.mockResolvedValue({ data: {} });
    state.patch.mockResolvedValue({ data: {} });
  });

  it("affecte seulement les niveaux disponibles avec la révision courante", async () => {
    mount();
    await screen.findByText("Primaire");
    expect(screen.getByLabelText("7e année — educationCycles.otherCycle")).toBeDisabled();
    fireEvent.click(screen.getAllByLabelText("Niveau libre")[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "educationCycles.saveLevels" })[0]);
    await waitFor(() => expect(state.put).toHaveBeenCalledWith("/education/cycles/cycle-a/levels/", {
      expected_revision: 4,
      level_ids: ["level-1", "level-3"],
    }));
  });

  it("archive sans suppression et crée un cycle concret", async () => {
    mount();
    await screen.findByText("Primaire");
    fireEvent.click(screen.getAllByRole("button", { name: "educationCycles.archive" })[0]);
    await waitFor(() => expect(state.patch).toHaveBeenCalledWith("/education/cycles/cycle-a/", {
      expected_revision: 4, is_active: false,
    }));
    fireEvent.change(screen.getByLabelText("educationCycles.code"), { target: { value: "college" } });
    fireEvent.change(screen.getByLabelText("educationCycles.name"), { target: { value: "Collège urbain" } });
    fireEvent.click(screen.getByRole("button", { name: "educationCycles.create" }));
    await waitFor(() => expect(state.post).toHaveBeenCalledWith("/education/cycles/", expect.objectContaining({
      code: "COLLEGE", name: "Collège urbain", institution_type: "primary", period_type: "TRIMESTER",
    })));
  });

  it("reste en consultation pour un rôle enseignant", async () => {
    state.roles = ["TEACHER"];
    mount();
    await screen.findByText("Primaire");
    expect(screen.queryByRole("button", { name: "educationCycles.create" })).toBeNull();
    expect(screen.queryByRole("button", { name: "educationCycles.archive" })).toBeNull();
    expect(screen.getAllByRole("checkbox")[0]).toBeDisabled();
  });
});
