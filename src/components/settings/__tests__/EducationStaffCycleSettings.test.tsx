import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EducationStaffCycleSettings } from "@/components/settings/EducationStaffCycleSettings";

const state = vi.hoisted(() => ({
  roles: ["TENANT_ADMIN"],
  get: vi.fn(), put: vi.fn(),
}));

vi.mock("@/api/client", () => ({ apiClient: { get: state.get, put: state.put } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ roles: state.roles }) }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { id: "school", slug: "school" } }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const cycles = [
  { id: "cycle-a", code: "A", name: "Primaire", is_active: true },
  { id: "cycle-b", code: "B", name: "Collège", is_active: true },
  { id: "cycle-old", code: "OLD", name: "Ancien", is_active: false },
];
const staff = {
  total: 2,
  cycle_policy_available: false,
  items: [
    { user_id: "u-dir", first_name: "Awa", last_name: "Camara", email: "awa@example.gn", is_active: true,
      roles: ["DIRECTOR"], restrictable: true, cycle_ids: ["cycle-a"] },
    { user_id: "u-adm", first_name: "Promu", last_name: "Admin", email: "adm@example.gn", is_active: true,
      roles: ["TENANT_ADMIN"], restrictable: false, cycle_ids: ["cycle-b"] },
  ],
};

function mount() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <EducationStaffCycleSettings />
  </QueryClientProvider>);
}

describe("personnel par cycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.roles = ["TENANT_ADMIN"];
    state.get.mockImplementation((url: string) => Promise.resolve({ data: url === "/education/cycles/" ? cycles : staff }));
    state.put.mockResolvedValue({ data: {} });
  });

  it("envoie l'ensemble vu par l'administrateur avec le nouvel ensemble", async () => {
    mount();
    await screen.findByText("Awa Camara");
    expect(screen.getByText("educationCycles.staff.limitedAccessNotice")).toBeInTheDocument();
    const [firstSave] = screen.getAllByRole("button", { name: "educationCycles.staff.save" });
    expect(firstSave).toBeDisabled();
    fireEvent.click(screen.getAllByLabelText("Collège")[0]);
    expect(firstSave).toBeEnabled();
    fireEvent.click(firstSave);
    await waitFor(() => expect(state.put).toHaveBeenCalledWith("/education/staff-cycles/u-dir/", {
      expected_cycle_ids: ["cycle-a"],
      cycle_ids: ["cycle-a", "cycle-b"],
    }));
  });

  it("n'offre pas de cycle archivé et ne permet que le retrait pour un compte non restreignable", async () => {
    mount();
    await screen.findByText("Promu Admin");
    expect(screen.queryByLabelText(/Ancien/)).not.toBeInTheDocument();
    expect(screen.getByText("educationCycles.staff.notRestrictable")).toBeInTheDocument();
    const primaire = screen.getAllByLabelText("Primaire")[1];
    const college = screen.getAllByLabelText("Collège")[1];
    expect(primaire).toBeDisabled();
    expect(college).toBeEnabled();
    fireEvent.click(college);
    fireEvent.click(screen.getAllByRole("button", { name: "educationCycles.staff.save" })[1]);
    await waitFor(() => expect(state.put).toHaveBeenCalledWith("/education/staff-cycles/u-adm/", {
      expected_cycle_ids: ["cycle-b"],
      cycle_ids: [],
    }));
  });

  it("n'affiche rien et n'interroge pas l'API pour un rôle non administrateur", () => {
    state.roles = ["DIRECTOR"];
    const { container } = mount();
    expect(container).toBeEmptyDOMElement();
    expect(state.get).not.toHaveBeenCalled();
  });
});
