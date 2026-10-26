import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { usePlan } from "@/hooks/usePlan";

const mockGet = vi.fn();

vi.mock("@/api/client", () => ({
  apiClient: { get: (...args: unknown[]) => mockGet(...args) },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function accessFor(subscription: Record<string, unknown>) {
  mockGet.mockResolvedValue({ data: subscription });
  const { result } = renderHook(() => usePlan(), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  return result.current.hasAccess("standard");
}

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe("usePlan — grille sans offre gratuite", () => {
  beforeEach(() => mockGet.mockReset());

  it("ouvre l'accès pendant l'essai", async () => {
    expect(await accessFor({ plan: "standard", status: "trialing", trial_ends_at: inDays(5) })).toBe(true);
  });

  it("ferme l'accès à un essai échu ou sans date de fin", async () => {
    expect(await accessFor({ plan: "standard", status: "trialing", trial_ends_at: inDays(-1) })).toBe(false);
    expect(await accessFor({ plan: "standard", status: "trialing", trial_ends_at: null })).toBe(false);
  });

  it("ferme l'accès à l'ancienne offre gratuite et à un abonnement expiré", async () => {
    expect(await accessFor({ plan: "starter", status: "active", trial_ends_at: null })).toBe(false);
    expect(await accessFor({ plan: "premium", status: "expired", trial_ends_at: null })).toBe(false);
  });

  it("ouvre l'accès à toute offre payante active", async () => {
    for (const plan of ["standard", "medium", "premium", "enterprise"]) {
      expect(await accessFor({ plan, status: "active", trial_ends_at: null })).toBe(true);
    }
  });
});
