/**
 * Regression test: enrollStudents must POST to the real /enrollments/
 * endpoint (once per student). It previously posted to /enrollments/bulk/,
 * an endpoint that does not exist on the backend (404), which silently
 * broke the "Inscriptions aux classes" screen for every tenant.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEnrollments } from "@/hooks/queries/useEnrollments";
import { apiClient } from "@/api/client";

vi.mock("@/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("useEnrollments - enrollStudents", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("posts each enrollment individually to /enrollments/ (not /enrollments/bulk/)", async () => {
    const { result } = renderHook(
      () => useEnrollments("tenant-1", "year-1", "class-1"),
      { wrapper }
    );

    const enrollments = [
      { tenant_id: "tenant-1", student_id: "s1", academic_year_id: "year-1", class_id: "class-1", status: "ACTIVE" },
      { tenant_id: "tenant-1", student_id: "s2", academic_year_id: "year-1", class_id: "class-1", status: "ACTIVE" },
    ];

    await act(async () => {
      await result.current.enrollStudents(enrollments);
    });

    expect(apiClient.post).toHaveBeenCalledTimes(2);
    expect(apiClient.post).toHaveBeenNthCalledWith(1, "/enrollments/", enrollments[0]);
    expect(apiClient.post).toHaveBeenNthCalledWith(2, "/enrollments/", enrollments[1]);
    expect(apiClient.post).not.toHaveBeenCalledWith("/enrollments/bulk/", expect.anything());
  });
});

describe("useEnrollments - transferEnrollment (A5)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("changes class with a single call, never withdraw + enroll", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: "new", class_id: "class-2", status: "ACTIVE" } });
    const { result } = renderHook(() => useEnrollments("tenant-1", "year-1", "class-1"), { wrapper });

    await act(async () => {
      await result.current.transferEnrollment({ enrollmentId: "enr-1", classId: "class-2" });
    });

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.post).toHaveBeenCalledWith("/enrollments/enr-1/transfer/", { class_id: "class-2" });
    expect(apiClient.delete).not.toHaveBeenCalled();
  });

  it("propagates a refused transfer to the caller", async () => {
    vi.mocked(apiClient.post).mockRejectedValue({ response: { status: 409, data: { detail: "La classe appartient à une autre année académique" } } });
    const { result } = renderHook(() => useEnrollments("tenant-1", "year-1", "class-1"), { wrapper });

    await expect(result.current.transferEnrollment({ enrollmentId: "enr-1", classId: "class-x" }))
      .rejects.toMatchObject({ response: { status: 409 } });
    await waitFor(() => expect(result.current.isTransferring).toBe(false));
  });
});
