import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EducationModuleSettings } from "@/components/settings/EducationModuleSettings";

const state = vi.hoisted(() => ({
  config: { tenant_id: "school", revision: 3, mode: "configured", profile_id: "primary", overrides: {}, enabled_modules: ["finance", "library"] },
  roles: ["TENANT_ADMIN"], post: vi.fn(), put: vi.fn(), refetch: vi.fn(), switchTenant: vi.fn(),
}));
vi.mock("@/api/client", () => ({ apiClient: { post: state.post, put: state.put } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ roles: state.roles }) }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { id: "school" }, switchTenant: state.switchTenant }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/useEducationModules", () => ({
  useEducationCatalog: () => ({ data: { catalog_version: 1, profiles: [{ id: "primary", default_modules: ["finance", "library"] }], modules: [
    { id: "finance", core: true, available: true, dependencies: [] },
    { id: "library", core: false, available: true, dependencies: [] },
    { id: "competencies", core: false, available: false, dependencies: [] },
  ] } }),
  useEducationModules: () => ({ refetch: state.refetch, data: state.config }),
}));
function mount() {
  return render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><EducationModuleSettings /></QueryClientProvider></MemoryRouter>);
}
describe("administration des modules", () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.roles = ["TENANT_ADMIN"];
    state.post.mockResolvedValue({ data: { added: [], removed: ["library"], preserves_history: true } });
    state.put.mockResolvedValue({ data: {} });
  });
  it("n'écrit qu'après aperçu et transmet la révision courante", async () => {
    mount();
    expect(screen.getByRole("switch", { name: "educationModules.modules.finance" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "educationModules.modules.competencies" })).toBeDisabled();
    const apply = screen.getByRole("button", { name: "educationModules.apply" });
    expect(apply).toBeDisabled();
    fireEvent.click(screen.getByRole("switch", { name: "educationModules.modules.library" }));
    expect(state.put).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "educationModules.preview" }));
    await waitFor(() => expect(apply).toBeEnabled());
    expect(state.post).toHaveBeenCalledWith("/education/preview/", { profile_id: "primary", overrides: { library: false }, expected_revision: 3 });
    expect(state.put).not.toHaveBeenCalled();
    fireEvent.click(apply);
    await waitFor(() => expect(state.put).toHaveBeenCalledWith("/education/configuration/", { profile_id: "primary", overrides: { library: false }, expected_revision: 3 }));
    await waitFor(() => expect(state.switchTenant).toHaveBeenCalledWith("school"));
  });
  it("recharge après conflit sans écraser avec une autre révision", async () => {
    state.put.mockRejectedValue({ response: { data: { detail: "Configuration modifiée" }, status: 409 } });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "educationModules.preview" }));
    const apply = screen.getByRole("button", { name: "educationModules.apply" });
    await waitFor(() => expect(apply).toBeEnabled());
    fireEvent.click(apply);
    await waitFor(() => expect(state.refetch).toHaveBeenCalledOnce());
    expect(state.put).toHaveBeenCalledOnce();
    expect(state.switchTenant).not.toHaveBeenCalled();
  });
  it("un enseignant ne dispose d'aucune action d'activation", () => {
    state.roles = ["TEACHER"]; mount();
    expect(screen.queryByRole("button", { name: "educationModules.apply" })).toBeNull();
    expect(screen.getByRole("switch", { name: "educationModules.modules.library" })).toBeDisabled();
  });
});
