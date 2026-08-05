/**
 * Fine points brief, Phase 5 — messages internes et réponses WhatsApp
 * hors ligne : brouillon local (jamais d'envoi direct WhatsApp depuis le
 * frontend), mise en file IndexedDB, jamais de publication tant que non
 * synchronisé (voir useSendMessage/useReplyWhatsApp in
 * src/queries/communication.ts).
 */
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockApiPost } = vi.hoisted(() => ({ mockApiPost: vi.fn() }));

vi.mock("@/api/client", () => ({
  apiClient: { post: mockApiPost },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { id: "tenant-1" } }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { useReplyWhatsApp, useSendMessage } from "@/queries/communication";
import { offlineDb } from "@/offline/db";

function networkError() {
  return { request: {}, response: undefined, message: "Network Error" };
}

function serverError(status: number) {
  return { request: {}, response: { status }, message: `HTTP ${status}` };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  vi.clearAllMocks();
  await offlineDb.offline_actions.clear();
});

describe("message queued offline", () => {
  it("un envoi de message échoué pour raison réseau est mis en file localement, jamais perdu", async () => {
    mockApiPost.mockRejectedValue(networkError());
    const { result } = renderHook(() => useSendMessage(), { wrapper });

    let mutationResult: unknown;
    await act(async () => {
      mutationResult = await result.current.mutateAsync({ conversationId: "conv-1", content: "Bonjour" });
    });

    expect((mutationResult as { queued: boolean }).queued).toBe(true);

    const queued = await offlineDb.offline_actions.toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0].kind).toBe("internal_message");
    expect(queued[0].url).toBe("/communication/conversations/conv-1/messages/");
    expect(queued[0].status).toBe("PENDING");
    expect(queued[0].tenantId).toBe("tenant-1");
  });

  it("un refus serveur (non réseau) n'est jamais mis en file — l'erreur remonte telle quelle", async () => {
    mockApiPost.mockRejectedValue(serverError(403));
    const { result } = renderHook(() => useSendMessage(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ conversationId: "conv-1", content: "Bonjour" });
      }),
    ).rejects.toBeTruthy();

    expect(await offlineDb.offline_actions.count()).toBe(0);
  });
});

describe("reply-whatsapp queued offline", () => {
  it("une réponse WhatsApp hors ligne est mise en brouillon local — jamais envoyée directement depuis le frontend", async () => {
    mockApiPost.mockRejectedValue(networkError());
    const { result } = renderHook(() => useReplyWhatsApp(), { wrapper });

    let mutationResult: unknown;
    await act(async () => {
      mutationResult = await result.current.mutateAsync({ threadId: "thread-1", body: "Merci, à bientôt." });
    });

    expect((mutationResult as { queued: boolean; status: string }).queued).toBe(true);
    expect((mutationResult as { status: string }).status).toBe("QUEUED_OFFLINE");

    const queued = await offlineDb.offline_actions.toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0].kind).toBe("whatsapp_reply");
    expect(queued[0].url).toBe("/communication/conversations/thread-1/reply-whatsapp/");
    // Never a direct WhatsApp send from the frontend — this is a queued
    // draft the backend (worker job) will actually dispatch once synced.
    expect(mockApiPost).toHaveBeenCalledTimes(1); // only the failed attempt, no bypass send
  });

  it("réécrire un brouillon avant sync remplace l'ancien (dedupeKey) plutôt que d'en ajouter un second", async () => {
    mockApiPost.mockRejectedValue(networkError());
    const { result } = renderHook(() => useReplyWhatsApp(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ threadId: "thread-1", body: "Premier brouillon" });
    });
    await act(async () => {
      await result.current.mutateAsync({ threadId: "thread-1", body: "Brouillon corrigé" });
    });

    const queued = await offlineDb.offline_actions.toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0].body.body).toBe("Brouillon corrigé");
  });
});
