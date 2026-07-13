import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useParentData } from "../useParentData";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import React from "react";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  apiClient: {
    get: mocks.get,
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: vi.fn(),
}));

describe("useParentData Hook", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    vi.mocked(useAuth).mockReturnValue({
      user: { id: "parent-1" },
    } as ReturnType<typeof useAuth>);
    vi.mocked(useTenant).mockReturnValue({
      tenant: { id: "tenant-1" },
    } as ReturnType<typeof useTenant>);
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("fetches and derives the parent dashboard data", async () => {
    mocks.get.mockResolvedValue({
      data: {
        children: [
          {
            id: "1",
            student_id: "s1",
            student: { id: "s1", first_name: "John" },
          },
        ],
        unpaidInvoices: [
          { id: "inv-1", total_amount: 100, paid_amount: 25 },
        ],
        upcomingEvents: [],
        notifications: [],
        unreadMessagesCount: 0,
        recentGrades: [],
        attendanceAlerts: [],
        latestScans: [],
      },
    });

    const { result } = renderHook(() => useParentData(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mocks.get).toHaveBeenCalledWith("/parents/dashboard/");
    expect(result.current.children).toHaveLength(1);
    expect(result.current.studentIds).toEqual(["s1"]);
    expect(result.current.totalUnpaid).toBe(75);
  });

  it("does not fetch without an authenticated parent and tenant", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
    } as ReturnType<typeof useAuth>);
    vi.mocked(useTenant).mockReturnValue({
      tenant: null,
    } as ReturnType<typeof useTenant>);

    const { result } = renderHook(() => useParentData(), { wrapper });

    expect(mocks.get).not.toHaveBeenCalled();
    expect(result.current.children).toEqual([]);
    expect(result.current.studentIds).toEqual([]);
    expect(result.current.totalUnpaid).toBe(0);
    expect(result.current.isLoading).toBe(false);
  });
});
