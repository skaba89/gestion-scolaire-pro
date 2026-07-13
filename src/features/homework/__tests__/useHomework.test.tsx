/**
 * Tests for useHomework Hook
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useHomework } from "@/features/homework";
import { useTenant } from "@/contexts/TenantContext";

const mocks = vi.hoisted(() => ({
  listHomework: vi.fn(),
  createHomework: vi.fn(),
  updateHomework: vi.fn(),
  deleteHomework: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: vi.fn(),
}));

vi.mock("@/features/homework/services/homeworkService", () => ({
  homeworkService: {
    listHomework: mocks.listHomework,
    createHomework: mocks.createHomework,
    updateHomework: mocks.updateHomework,
    deleteHomework: mocks.deleteHomework,
  },
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

describe("useHomework Hook", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listHomework.mockResolvedValue([]);

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.mocked(useTenant).mockReturnValue({
      currentTenant: {
        id: "tenant-1",
        name: "Test School",
      },
    } as ReturnType<typeof useTenant>);
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("initializes with an empty homework list", async () => {
    const { result } = renderHook(() => useHomework(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.homeworkList).toEqual([]);
    expect(mocks.listHomework).toHaveBeenCalledWith("tenant-1", undefined);
  });

  it("exposes homework query data", () => {
    const { result } = renderHook(() => useHomework(), { wrapper });

    expect(result.current).toHaveProperty("homeworkList");
    expect(result.current).toHaveProperty("isLoading");
    expect(result.current).toHaveProperty("error");
    expect(result.current).toHaveProperty("refetch");
  });

  it("exposes mutation actions", () => {
    const { result } = renderHook(() => useHomework(), { wrapper });

    expect(result.current).toHaveProperty("create");
    expect(result.current).toHaveProperty("update");
    expect(result.current).toHaveProperty("delete");
  });

  it("initializes mutation loading states as idle", () => {
    const { result } = renderHook(() => useHomework(), { wrapper });

    expect(result.current.isCreating).toBe(false);
    expect(result.current.isUpdating).toBe(false);
    expect(result.current.isDeleting).toBe(false);
  });
});
