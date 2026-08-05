/**
 * Fine points brief, Phase 5 — offline notes (grades) queue: brouillon
 * local, sync au retour réseau, statut visible (PENDING/SYNCING/SYNCED/
 * REJECTED), et surtout : un conflit 409 doit être affiché comme un
 * conflit, jamais silencieusement traité comme un succès (regression —
 * see syncGrade()/syncAttendance() in useOfflineSync.ts).
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockApiPost } = vi.hoisted(() => ({ mockApiPost: vi.fn() }));

vi.mock("@/api/client", () => ({
  apiClient: { post: mockApiPost },
}));

import { useOfflineSync } from "@/hooks/useOfflineSync";
import { offlineDb, queueGrade, type PendingGrade } from "@/lib/offlineDb";

function networkError() {
  return { request: {}, response: undefined, message: "Network Error" };
}

function serverError(status: number, detail = "erreur") {
  return { request: {}, response: { status, data: { detail } }, message: `HTTP ${status}` };
}

async function addGrade(overrides: Partial<PendingGrade> = {}): Promise<number> {
  return queueGrade({
    localId: crypto.randomUUID(),
    tenantId: "tenant-1",
    studentId: "student-1",
    subjectId: "subject-1",
    assessmentId: "assessment-1",
    score: 15,
    maxScore: 20,
    coefficient: 1,
    ...overrides,
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  await offlineDb.pendingGrades.clear();
  await offlineDb.pendingAttendance.clear();
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
});

describe("grade draft queued", () => {
  it("un brouillon de note hors ligne est mis en file avec le statut PENDING", async () => {
    const id = await addGrade();
    const row = await offlineDb.pendingGrades.get(id);
    expect(row).toBeTruthy();
    expect(row!.synced).toBe(0);
    expect(row!.syncStatus).toBe("PENDING");
  });
});

describe("grade draft sync success", () => {
  it("synchronise avec succès et passe au statut SYNCED (visible, plus compté comme en attente)", async () => {
    mockApiPost.mockResolvedValue({ data: { id: "grade-1" } });
    await addGrade();

    const { result } = renderHook(() => useOfflineSync());
    await act(async () => {
      await result.current.syncNow();
    });

    await waitFor(async () => {
      const rows = await offlineDb.pendingGrades.toArray();
      expect(rows[0].syncStatus).toBe("SYNCED");
      expect(rows[0].synced).toBe(1);
      expect(rows[0].conflict).toBe(false);
    });
    expect(mockApiPost).toHaveBeenCalledWith(
      "/grades/",
      expect.any(Object),
      expect.objectContaining({ headers: expect.objectContaining({ "X-Idempotency-Key": expect.any(String) }) }),
    );
  });
});

describe("grade draft conflict 409", () => {
  it("un 409 est affiché comme un CONFLIT — jamais traité comme un succès silencieux", async () => {
    // renderHook's mount effect fires its own syncNow() as soon as
    // navigator.onLine is true, racing with the explicit call below (the
    // isSyncingRef guard makes the loser a no-op) — so assert on the
    // persisted IndexedDB state (via waitFor) rather than on whichever
    // call's return value happened to win the race.
    mockApiPost.mockRejectedValue(serverError(409, "Idempotency-Key déjà utilisée avec un contenu différent"));
    await addGrade();

    const { result } = renderHook(() => useOfflineSync());
    await act(async () => {
      await result.current.syncNow();
    });

    await waitFor(async () => {
      const rows = await offlineDb.pendingGrades.toArray();
      expect(rows[0].syncStatus).toBe("REJECTED");
      expect(rows[0].conflict).toBe(true);
    });

    const rows = await offlineDb.pendingGrades.toArray();
    expect(rows[0].synced).toBe(0); // regression guard: NOT marked as synced/success
    expect(rows[0].syncError).toMatch(/conflit/i);
  });

  it("un conflit résolu ne repasse jamais 'pending' — il n'est plus rejoué au sync suivant", async () => {
    mockApiPost.mockRejectedValueOnce(serverError(409));
    await addGrade();

    const { result } = renderHook(() => useOfflineSync());
    await act(async () => {
      await result.current.syncNow();
    });

    mockApiPost.mockClear();
    await act(async () => {
      await result.current.syncNow();
    });

    expect(mockApiPost).not.toHaveBeenCalled();
  });
});

describe("erreur réseau", () => {
  it("reste PENDING sans pénalité (pas un rejet, pas un conflit)", async () => {
    mockApiPost.mockRejectedValue(networkError());
    await addGrade();

    const { result } = renderHook(() => useOfflineSync());
    await act(async () => {
      await result.current.syncNow();
    });

    await waitFor(async () => {
      expect(mockApiPost).toHaveBeenCalled();
    });
    const rows = await offlineDb.pendingGrades.toArray();
    expect(rows[0].syncStatus).toBe("PENDING");
    expect(rows[0].retries).toBe(0);
  });
});
