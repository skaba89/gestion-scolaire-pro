/**
 * Lot B3 : le filtre du menu (isPathEnabled) combine modules de l'établissement ET périmètre
 * par cycle renvoyé par le serveur ; un compte non restreint garde exactement son menu.
 */
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock("@/api/client", () => ({ apiClient: { get: mockGet } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { id: "t1" } }) }));

import { useEducationModules } from "@/hooks/useEducationModules";

const configuration = {
  tenant_id: "t1", revision: 1, mode: "configured", profile_id: "mixed", overrides: {},
  enabled_modules: ["academics", "assessments", "attendance", "finance", "authentication", "users"],
  scope: "institution", cycle_policy_available: true,
};

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}

function serve(scope: unknown) {
  mockGet.mockImplementation((url: string) => Promise.resolve({
    data: url === "/education/my-scope/" ? scope : configuration,
  }));
}

describe("menu selon le périmètre par cycle", () => {
  beforeEach(() => mockGet.mockReset());

  it("masque les écrans refusés à un compte restreint", async () => {
    serve({ restricted: true, cycles: [], cycle_policy_available: true,
            pages: { students: true, grades: true, users: false } });
    const { result } = renderHook(() => useEducationModules(), { wrapper });
    await waitFor(() => expect(result.current.cycleScope?.restricted).toBe(true));
    expect(result.current.isPathEnabled("/ecole/admin/students")).toBe(true);
    expect(result.current.isPathEnabled("/ecole/admin/users")).toBe(false);
  });

  it("ne change rien pour un compte non restreint", async () => {
    serve({ restricted: false, cycles: [], pages: null, cycle_policy_available: true });
    const { result } = renderHook(() => useEducationModules(), { wrapper });
    await waitFor(() => expect(result.current.cycleScope?.restricted).toBe(false));
    expect(result.current.isPathEnabled("/ecole/admin/users")).toBe(true);
    expect(result.current.isPathEnabled("/ecole/admin/students")).toBe(true);
  });
});
