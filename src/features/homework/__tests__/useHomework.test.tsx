/**
 * Tests for useHomework Hook
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useHomework } from "@/features/homework";
import { useTenant } from "@/contexts/TenantContext";

// Mock TenantContext
vi.mock("@/contexts/TenantContext", () => ({
  useTenant: vi.fn(),
}));

describe("useHomework Hook", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Mock tenant context
    (useTenant as any).mockReturnValue({
      currentTenant: {
        id: "tenant-1",
        name: "Test School",
      },
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("should initialize with empty homework list", () => {
    const { result } = renderHook(() => useHomework(), { wrapper });

    expect(result.current.homework).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it("should expose homework data", () => {
    const { result } = renderHook(() => useHomework(), { wrapper });

    expect(result.current).toHaveProperty("homework");
    expect(result.current).toHaveProperty("isLoading");
    expect(result.current).toHaveProperty("error");
  });

  it("should expose mutations", () => {
    const { result } = renderHook(() => useHomework(), { wrapper });

    expect(result.current).toHaveProperty("isCreating");
    expect(result.current).toHaveProperty("isUpdating");
    expect(result.current).toHaveProperty("isDeleting");
    expect(result.current).toHaveProperty("createHomework");
    expect(result.current).toHaveProperty("updateHomework");
    expect(result.current).toHaveProperty("deleteHomework");
  });

  it("should have loading states for mutations", () => {
    const { result } = renderHook(() => useHomework(), { wrapper });

    expect(result.current.isCreating).toBe(false);
    expect(result.current.isUpdating).toBe(false);
    expect(result.current.isDeleting).toBe(false);
  });
});
