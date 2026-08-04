/** Tests de la file d'actions offline IndexedDB (Phase 6, WhatsApp/offline
 * hardening brief) — remplace src/lib/__tests__/offline-queue.test.ts. */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { offlineDb } from "@/offline/db";
import {
  OFFLINE_QUEUE_CAP,
  clearOfflineQueue,
  enqueueAction,
  flushOfflineQueue,
  getQueuedActions,
  isNetworkError,
  queueLength,
} from "@/offline/outbox";

const TENANT = "tenant-1";

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

beforeEach(async () => {
  await offlineDb.offline_actions.clear();
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
  it("ajoute une action horodatée, identifiée et avec une idempotencyKey", async () => {
    const entry = await enqueueAction(makeAttendance("s1"));
    expect(entry.id).toBeTruthy();
    expect(entry.idempotencyKey).toBeTruthy();
    expect(entry.createdAt).toBeTruthy();
    expect(entry.status).toBe("PENDING");
    expect(await queueLength()).toBe(1);
  });

  it("déduplique par dedupeKey — le dernier statut gagne, nouvelle idempotencyKey", async () => {
    const first = await enqueueAction(makeAttendance("s1", "PRESENT"));
    const second = await enqueueAction(makeAttendance("s1", "ABSENT"));
    const queue = await getQueuedActions();
    expect(queue).toHaveLength(1);
    expect(queue[0].body.status).toBe("ABSENT");
    expect(queue[0].idempotencyKey).not.toBe(first.idempotencyKey);
    expect(queue[0].idempotencyKey).toBe(second.idempotencyKey);
  });

  it("borne la taille de la file en gardant les plus récentes", async () => {
    for (let i = 0; i < OFFLINE_QUEUE_CAP + 10; i++) {
      await enqueueAction(makeAttendance(`s${i}`));
    }
    const queue = await getQueuedActions();
    expect(queue).toHaveLength(OFFLINE_QUEUE_CAP);
    expect(queue[queue.length - 1].body.student_id).toBe(`s${OFFLINE_QUEUE_CAP + 9}`);
  });
});

describe("flushOfflineQueue", () => {
  it("rejoue en séquence, envoie X-Idempotency-Key et vide la file en cas de succès", async () => {
    const a1 = await enqueueAction(makeAttendance("s1"));
    await enqueueAction(makeAttendance("s2"));
    const client = { post: vi.fn().mockResolvedValue({}), patch: vi.fn(), put: vi.fn() };

    const result = await flushOfflineQueue(TENANT, client);

    expect(result).toEqual({ sent: 2, rejected: [], remaining: 0 });
    expect(client.post).toHaveBeenCalledTimes(2);
    expect(client.post.mock.calls[0][2]).toEqual({
      headers: { "X-Idempotency-Key": a1.idempotencyKey },
    });
    expect(await queueLength()).toBe(0);
  });

  it("abandonne définitivement les actions refusées par le serveur", async () => {
    await enqueueAction(makeAttendance("s1"));
    await enqueueAction(makeAttendance("s2"));
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
    await enqueueAction(makeAttendance("s1"));
    await enqueueAction(makeAttendance("s2"));
    const client = { post: vi.fn().mockRejectedValue(networkError()), patch: vi.fn(), put: vi.fn() };

    const result = await flushOfflineQueue(TENANT, client);

    expect(result).toEqual({ sent: 0, rejected: [], remaining: 2 });
    expect(client.post).toHaveBeenCalledTimes(1); // pas d'acharnement
    expect(await queueLength()).toBe(2);
  });

  it("ignore et retire les brouillons d'un autre tenant (sécurité)", async () => {
    await enqueueAction({ ...makeAttendance("s1"), tenantId: "autre-tenant" });
    await enqueueAction(makeAttendance("s2"));
    const client = { post: vi.fn().mockResolvedValue({}), patch: vi.fn(), put: vi.fn() };

    const result = await flushOfflineQueue(TENANT, client);

    expect(result.sent).toBe(1);
    expect(client.post).toHaveBeenCalledTimes(1);
    expect(client.post.mock.calls[0][1].student_id).toBe("s2");
    expect(await queueLength()).toBe(0);
  });

  it("ne rejoue rien sans tenant courant", async () => {
    await enqueueAction(makeAttendance("s1"));
    const client = { post: vi.fn(), patch: vi.fn(), put: vi.fn() };

    const result = await flushOfflineQueue(null, client);

    expect(result.sent).toBe(0);
    expect(client.post).not.toHaveBeenCalled();
    expect(await queueLength()).toBe(0); // purgée : contexte inconnu
  });
});

describe("clearOfflineQueue", () => {
  it("purge la file (logout)", async () => {
    await enqueueAction(makeAttendance("s1"));
    await clearOfflineQueue();
    expect(await queueLength()).toBe(0);
  });
});
