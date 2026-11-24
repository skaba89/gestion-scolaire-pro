/**
 * Écran d'administration « Enseignants » : useTeacherSchedule ne doit jamais se rabattre sur le
 * compte connecté. Sans enseignant sélectionné, il chargeait le tableau de bord enseignant de
 * l'administrateur lui-même (GET /teachers/dashboard/), refusé à un compte limité à des cycles
 * (parcours E2E 23). Le portail enseignant (useTeacherData sans identifiant) n'est pas modifié.
 */
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock("@/api/client", () => ({ apiClient: { get: mockGet } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "admin-1" } }) }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ currentTenant: { id: "t1" }, tenant: { id: "t1" } }) }));

import { useTeacherData, useTeacherSchedule } from "@/features/staff/hooks/useStaff";

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}

describe("useTeacherSchedule (écrans d'administration)", () => {
  beforeEach(() => { mockGet.mockReset(); mockGet.mockResolvedValue({ data: [] }); });

  it("n'appelle rien tant qu'aucun enseignant n'est sélectionné", async () => {
    renderHook(() => useTeacherSchedule(undefined), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("charge l'emploi du temps de l'enseignant sélectionné", async () => {
    renderHook(() => useTeacherSchedule("teacher-7"), { wrapper });
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/teachers/teacher-7/schedule/"));
    expect(mockGet).not.toHaveBeenCalledWith("/teachers/dashboard/", expect.anything());
  });

  it("le portail enseignant garde son tableau de bord personnel", async () => {
    mockGet.mockResolvedValue({ data: { assignments: [], schedule: [], assessments: [] } });
    renderHook(() => useTeacherData(), { wrapper });
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/teachers/dashboard/", { params: { teacher_id: "admin-1" } }));
  });
});
