/**
 * useRealtimeMessages — file d'attente couverte pour Horizon 1 (messagerie
 * temps réel) : le hook est désormais monté dans les 6 layouts de portail
 * (Admin/Parent/Teacher/Student/Alumni/Department), plus seulement dans
 * ParentDashboard. Cette suite couvre :
 * - le polling régulier de /communication/messaging/poll/ ;
 * - le lien "Voir" du toast, qui doit pointer vers la page Messages du
 *   portail COURANT (bug corrigé : il pointait auparavant toujours vers
 *   /:tenantSlug/messages, une route qui n'existe dans aucun portail —
 *   la vraie route est /:tenantSlug/:portal/messages).
 */
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockApiGet, mockNavigate, mockToastInfo } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockNavigate: vi.fn(),
  mockToastInfo: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  apiClient: { get: mockApiGet },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ currentTenant: { id: "tenant-1", slug: "universite-la-source" } }),
}));

vi.mock("sonner", () => ({
  toast: { info: mockToastInfo },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

import { useRealtimeMessages } from "@/hooks/useRealtimeMessages";

function wrapper(initialPath: string) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockApiGet.mockResolvedValue({ data: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useRealtimeMessages", () => {
  it("interroge /communication/messaging/poll/ toutes les 5 secondes", async () => {
    renderHook(() => useRealtimeMessages(), {
      wrapper: wrapper("/universite-la-source/teacher"),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(mockApiGet).toHaveBeenCalledWith(
      "/communication/messaging/poll/",
      expect.objectContaining({ params: expect.objectContaining({ since: expect.any(String) }) }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });

  it("le lien 'Voir' du toast navigue vers la page Messages du portail courant (teacher)", async () => {
    mockApiGet.mockResolvedValue({
      data: [
        {
          id: "m1",
          content: "Bonjour",
          created_at: new Date().toISOString(),
          sender_id: "sender-1",
          conversation_id: "conv-1",
          sender_name: "Un parent",
        },
      ],
    });

    renderHook(() => useRealtimeMessages(), {
      wrapper: wrapper("/universite-la-source/teacher/classes"),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(mockToastInfo).toHaveBeenCalledTimes(1);
    const [, options] = mockToastInfo.mock.calls[0];
    options.action.onClick();

    expect(mockNavigate).toHaveBeenCalledWith("/universite-la-source/teacher/messages");
  });

  it("le lien 'Voir' navigue vers la page Messages du portail Admin, pas une route générique", async () => {
    mockApiGet.mockResolvedValue({
      data: [
        {
          id: "m2",
          content: "Rappel",
          created_at: new Date().toISOString(),
          sender_id: "sender-2",
          conversation_id: "conv-2",
          sender_name: "La direction",
        },
      ],
    });

    renderHook(() => useRealtimeMessages(), {
      wrapper: wrapper("/universite-la-source/admin/dashboard"),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    const [, options] = mockToastInfo.mock.calls[0];
    options.action.onClick();

    expect(mockNavigate).toHaveBeenCalledWith("/universite-la-source/admin/messages");
  });
});
