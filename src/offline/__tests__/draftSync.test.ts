/** O2 côté brouillons (SchoolFlowOfflineDB) : un envoi interrompu, resté
 * SYNCING, doit être renvoyé avec la même clé d'idempotence. */
import { beforeEach, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/api/client", () => ({ apiClient: { post } }));

import { offlineDb } from "@/lib/offlineDb";
import { syncPendingDrafts, whenDraftSyncIdle } from "@/offline/draftSync";

beforeEach(async () => {
  await whenDraftSyncIdle();
  post.mockReset();
  await Promise.all(offlineDb.tables.map((t) => t.clear()));
});

it("renvoie un brouillon de présence resté SYNCING, avec sa clé d'origine", async () => {
  await offlineDb.pendingAttendance.add({
    localId: "local-interrompu", tenantId: "t1", studentId: "s1", classroomId: "c1", date: "2026-11-09",
    status: "ABSENT", synced: 0, syncStatus: "SYNCING", retries: 0, createdAt: Date.now(),
  } as never);
  post.mockResolvedValue({ data: {} });

  const result = await syncPendingDrafts();

  expect(result.synced).toBe(1);
  expect(post).toHaveBeenCalledWith(
    "/attendance/",
    expect.objectContaining({ student_id: "s1", status: "ABSENT" }),
    { headers: { "X-Idempotency-Key": "local-interrompu" } },
  );
  const row = await offlineDb.pendingAttendance.toCollection().first();
  expect(row?.syncStatus).toBe("SYNCED");
});

it("renvoie aussi une note restée SYNCING", async () => {
  await offlineDb.pendingGrades.add({
    localId: "note-interrompue", tenantId: "t1", studentId: "s1", subjectId: "m1", assessmentId: "a1",
    score: 14, maxScore: 20, coefficient: 1, synced: 0, syncStatus: "SYNCING", retries: 0, createdAt: Date.now(),
  } as never);
  post.mockResolvedValue({ data: {} });

  expect((await syncPendingDrafts()).synced).toBe(1);
  expect(post.mock.calls[0][2]).toEqual({ headers: { "X-Idempotency-Key": "note-interrompue" } });
});
