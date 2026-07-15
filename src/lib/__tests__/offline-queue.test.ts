/** Tests de la file d'actions offline (Phase 6, PR 4). */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  OFFLINE_QUEUE_CAP,
  OFFLINE_QUEUE_KEY,
  clearOfflineQueue,
  enqueueAction,
  flushOfflineQueue,
  getQueuedActions,
  isNetworkError,
  queueLength,
} from "@/lib/offline-queue";

const TENANT = "tenant-1";

// Le setup global remplace localStorage par des vi.fn() no-op ; ces tests
// ont besoin d'un stockage fonctionnel (isolé à ce fichier par Vitest).
function installFunctionalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => store.clear(),
    },
  });
}

function makeAttendance(studentId: string, status = "PRESENT") {
  return {
    kind: "attendance",
    method: "POST" as const,
    url: "/attendance/",
    body: { student_id: studentId, status },
    dedupeKey: `attendance:c1:2026-07-15:${studentId}`,
    tenantId: TENANT,
    userId: "user-1",
  };
}

function networkError() {
  return { request: {}, response: undefined, message: "Network Error" };
}

function serverError(status: number) {
  return { request: {}, response: { status }, message: `HTTP ${status}` };
}

beforeEach(() => {
  installFunctionalStorage();
  clearOfflineQueue();
});

describe("isNetworkError", () => {
  it("vrai pour une erreur axios sans réponse", () => {
    expect(isNetworkError(networkError())).toBe(true);
  });
  it("faux pour une réponse HTTP du serveur", () => {
    expect(isNetworkError(serverError(403))).toBe(false);
  });
  it("faux pour une erreur JS quelconque", () => {
    expect(isNetworkError(new Error("boom"))).toBe(false);
  });
});

describe("enqueueAction", () => {
  it("ajoute une action horodatée et identifiée", () => {
    const entry = enqueueAction(makeAttendance("s1"));
    expect(entry.id).toBeTruthy();
    expect(entry.createdAt).toBeTruthy();
    expect(queueLength()).toBe(1);
  });

  it("déduplique par dedupeKey — le dernier statut gagne", () => {
    enqueueAction(makeAttendance("s1", "PRESENT"));
    enqueueAction(makeAttendance("s1", "ABSENT"));
    const queue = getQueuedActions();
    expect(queue).toHaveLength(1);
    expect(queue[0].body.status).toBe("ABSENT");
  });

  it("borne la taille de la file en gardant les plus récentes", () => {
    for (let i = 0; i < OFFLINE_QUEUE_CAP + 10; i++) {
      enqueueAction(makeAttendance(`s${i}`));
    }
    const queue = getQueuedActions();
    expect(queue).toHaveLength(OFFLINE_QUEUE_CAP);
    expect(queue[queue.length - 1].body.student_id).toBe(`s${OFFLINE_QUEUE_CAP + 9}`);
  });
});

describe("flushOfflineQueue", () => {
  it("rejoue en séquence et vide la file en cas de succès", async () => {
    enqueueAction(makeAttendance("s1"));
    enqueueAction(makeAttendance("s2"));
    const client = { post: vi.fn().mockResolvedValue({}), patch: vi.fn(), put: vi.fn() };

    const result = await flushOfflineQueue(TENANT, client);

    expect(result).toEqual({ sent: 2, rejected: [], remaining: 0 });
    expect(client.post).toHaveBeenCalledTimes(2);
    expect(queueLength()).toBe(0);
  });

  it("abandonne définitivement les actions refusées par le serveur", async () => {
    enqueueAction(makeAttendance("s1"));
    enqueueAction(makeAttendance("s2"));
    const client = {
      post: vi.fn()
        .mockRejectedValueOnce(serverError(403))
        .mockResolvedValueOnce({}),
      patch: vi.fn(),
      put: vi.fn(),
    };

    const result = await flushOfflineQueue(TENANT, client);

    expect(result.sent).toBe(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].body.student_id).toBe("s1");
    expect(result.remaining).toBe(0);
  });

  it("s'arrête sur une erreur réseau et conserve le reste", async () => {
    enqueueAction(makeAttendance("s1"));
    enqueueAction(makeAttendance("s2"));
    const client = { post: vi.fn().mockRejectedValue(networkError()), patch: vi.fn(), put: vi.fn() };

    const result = await flushOfflineQueue(TENANT, client);

    expect(result).toEqual({ sent: 0, rejected: [], remaining: 2 });
    expect(client.post).toHaveBeenCalledTimes(1); // pas d'acharnement
    expect(queueLength()).toBe(2);
  });

  it("ignore et retire les brouillons d'un autre tenant (sécurité)", async () => {
    enqueueAction({ ...makeAttendance("s1"), tenantId: "autre-tenant" });
    enqueueAction(makeAttendance("s2"));
    const client = { post: vi.fn().mockResolvedValue({}), patch: vi.fn(), put: vi.fn() };

    const result = await flushOfflineQueue(TENANT, client);

    expect(result.sent).toBe(1);
    expect(client.post).toHaveBeenCalledTimes(1);
    expect(client.post.mock.calls[0][1].student_id).toBe("s2");
    expect(queueLength()).toBe(0);
  });

  it("ne rejoue rien sans tenant courant", async () => {
    enqueueAction(makeAttendance("s1"));
    const client = { post: vi.fn(), patch: vi.fn(), put: vi.fn() };

    const result = await flushOfflineQueue(null, client);

    expect(result.sent).toBe(0);
    expect(client.post).not.toHaveBeenCalled();
    expect(queueLength()).toBe(0); // purgée : contexte inconnu
  });
});

describe("clearOfflineQueue", () => {
  it("purge la file (logout)", () => {
    enqueueAction(makeAttendance("s1"));
    clearOfflineQueue();
    expect(queueLength()).toBe(0);
    expect(window.localStorage.getItem(OFFLINE_QUEUE_KEY) ?? null).toBeNull();
  });
});
