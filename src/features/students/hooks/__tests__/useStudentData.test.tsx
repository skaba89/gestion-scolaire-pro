import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useStudentData } from "../useStudentData";
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

const dashboardData = {
  student: { id: "student-1", first_name: "John" },
  enrollment: { class_id: "class-1" },
  grades: [],
  homework: [],
  schedule: [],
  checkInHistory: [],
  submissions: [],
};

describe("useStudentData Hook", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-1" },
    } as ReturnType<typeof useAuth>);
    vi.mocked(useTenant).mockReturnValue({
      tenant: { id: "tenant-1" },
    } as ReturnType<typeof useTenant>);
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("fetches and exposes the student dashboard", async () => {
    mocks.get.mockResolvedValue({ data: dashboardData });

    const { result } = renderHook(() => useStudentData(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mocks.get).toHaveBeenCalledWith("/students/dashboard/");
    expect(result.current.studentId).toBe("student-1");
    expect(result.current.classId).toBe("class-1");
    expect(result.current.student).toEqual(dashboardData.student);
  });

  it("does not fetch without an authenticated student", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
    } as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useStudentData(), { wrapper });

    expect(mocks.get).not.toHaveBeenCalled();
    expect(result.current.student).toBeNull();
    expect(result.current.studentId).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it("exposes the loading state while the dashboard request is pending", async () => {
    let resolveRequest: (value: { data: typeof dashboardData }) => void =
      () => undefined;
    mocks.get.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );

    const { result } = renderHook(() => useStudentData(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    act(() => {
      resolveRequest({ data: dashboardData });
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });
});
