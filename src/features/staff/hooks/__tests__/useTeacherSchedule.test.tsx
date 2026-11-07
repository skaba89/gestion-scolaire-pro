import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "@/api/client";
import { useTeacherData } from "../useStaff";

const context = vi.hoisted(() => ({
  user: { id: "admin-1" },
  tenant: { id: "tenant-1" },
}));

vi.mock("@/api/client", () => ({ apiClient: { get: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: context.user }) }));
vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ currentTenant: context.tenant }),
}));
vi.mock("@/hooks/useAuditLog", () => ({
  useAuditLog: () => ({ logCreate: vi.fn(), logUpdate: vi.fn(), logDelete: vi.fn() }),
}));

describe("useTeacherSchedule", () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  it("loads the selected teacher instead of the connected admin dashboard", async () => {
    const slot = { id: "slot-1", day_of_week: 1 };
    vi.mocked(apiClient.get).mockResolvedValue({ data: [slot] });

    const { result } = renderHook(() => useTeacherData("teacher-2"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(apiClient.get).toHaveBeenCalledWith("/teachers/teacher-2/schedule/");
    expect(apiClient.get).not.toHaveBeenCalledWith(
      "/teachers/dashboard/",
      expect.objectContaining({ params: { teacher_id: "teacher-2" } }),
    );
    expect(result.current.schedule).toEqual([slot]);
  });

  it("keeps the connected teacher on the self dashboard", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { assignments: [], schedule: [{ id: "mine", day_of_week: 2 }], assessments: [] },
    });

    const { result } = renderHook(() => useTeacherData(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(apiClient.get).toHaveBeenCalledWith("/teachers/dashboard/", {
      params: { teacher_id: "admin-1" },
    });
    expect(result.current.schedule).toEqual([{ id: "mine", day_of_week: 2 }]);
  });
});
