import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSubjects } from "../subjects";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/api/client", () => ({ apiClient: api }));

describe("canonical subjects query used by teacher hours", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads tenant subjects from the real GET /subjects/ endpoint", async () => {
    const subjects = [{ id: "subject-1", name: "Mathématiques" }];
    api.get.mockResolvedValue({ data: subjects });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSubjects("tenant-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith("/subjects/");
    expect(result.current.data).toEqual(subjects);
  });

  it("does not fetch subjects without an active tenant", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSubjects(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(api.get).not.toHaveBeenCalled();
  });
});
