/** O1 (lot hors-ligne n°1) : à la déconnexion, AUCUNE base hors ligne ne doit
 * conserver de données (noms d'élèves mineurs compris), et les saisies non
 * envoyées doivent être tentées puis comptées, jamais supprimées en silence. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/api/client", () => ({ apiClient: { post, patch: vi.fn(), put: vi.fn() } }));

import { db as legacyDb } from "@/lib/db";
import { offlineDb as draftsDb } from "@/lib/offlineDb";
import { offlineDb as outboxDb } from "@/offline/db";
import { enqueueAction } from "@/offline/outbox";
import { countUnsyncedOfflineWork, flushBeforeLogout, purgeAllOfflineData } from "@/offline/purge";

const TENANT = "tenant-1";

async function seedEverything() {
  await enqueueAction({
    kind: "attendance", method: "POST", url: "/attendance/", body: { student_id: "s1", status: "ABSENT" },
    dedupeKey: "attendance:c1:2026-11-09:s1", tenantId: TENANT, userId: "teacher-1",
  });
  await draftsDb.cachedStudents.put({
    id: "s1", tenantId: TENANT, classroomId: "c1", firstName: "Aïssatou", lastName: "Diallo",
    registrationNumber: "MAT-001", cachedAt: Date.now(),
  } as never);
  await draftsDb.pendingAttendance.add({
    localId: "local-1", tenantId: TENANT, studentId: "s1", classroomId: "c1", date: "2026-11-09",
    status: "ABSENT", synced: 0, syncStatus: "PENDING", retries: 0, createdAt: Date.now(),
  } as never);
  await legacyDb.students.put({
    id: "s1", registration_number: "MAT-001", first_name: "Aïssatou", last_name: "Diallo",
    tenant_id: TENANT, last_updated: Date.now(),
  });
}

async function totalRows() {
  const all = [outboxDb.offline_actions, ...draftsDb.tables, ...legacyDb.tables];
  const counts = await Promise.all(all.map((t) => t.count()));
  return counts.reduce((a, b) => a + b, 0);
}

beforeEach(async () => {
  post.mockReset();
  await purgeAllOfflineData();
});
afterEach(() => vi.restoreAllMocks());

describe("purgeAllOfflineData", () => {
  it("vide la file, les brouillons, le cache d'élèves et l'ancienne base", async () => {
    await seedEverything();
    expect(await totalRows()).toBeGreaterThanOrEqual(4);

    await purgeAllOfflineData();

    expect(await totalRows()).toBe(0);
    expect(await draftsDb.cachedStudents.count()).toBe(0);
  });

  it("journalise une table impossible à vider sans arrêter les autres", async () => {
    await seedEverything();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // Dexie crée une instance de Table par accès : on cible le prototype et
    // on ne fait échouer que la table des élèves en cache.
    const proto = Object.getPrototypeOf(draftsDb.cachedStudents);
    const original = proto.clear;
    vi.spyOn(proto, "clear").mockImplementation(function (this: { name: string }) {
      return this.name === "cachedStudents" ? Promise.reject(new Error("quota")) : original.call(this);
    });

    await purgeAllOfflineData();

    expect(error).toHaveBeenCalledWith(expect.stringContaining("cachedStudents"), expect.any(Error));
    vi.mocked(proto.clear).mockRestore();
    expect(await outboxDb.offline_actions.count()).toBe(0);
    expect(await draftsDb.pendingAttendance.count()).toBe(0);
  });
});

describe("flushBeforeLogout", () => {
  it("en ligne : envoie la file et les brouillons, puis ne compte plus rien à perdre", async () => {
    await seedEverything();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    post.mockResolvedValue({ data: {} });

    const lost = await flushBeforeLogout(TENANT);

    expect(lost).toBe(0);
    const urls = post.mock.calls.map(([url]) => url);
    expect(urls.filter((u) => u === "/attendance/")).toHaveLength(2); // file + brouillon
    expect(post.mock.calls.every(([, , cfg]) => cfg?.headers?.["X-Idempotency-Key"])).toBe(true);
  });

  it("hors ligne : n'envoie rien et compte les saisies qui seront perdues", async () => {
    await seedEverything();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    const lost = await flushBeforeLogout(TENANT);

    expect(post).not.toHaveBeenCalled();
    expect(lost).toBe(await countUnsyncedOfflineWork());
    expect(lost).toBe(2); // 1 action de la file + 1 brouillon de présence
  });

  it("serveur injoignable pendant l'envoi : les saisies restent comptées", async () => {
    await seedEverything();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    post.mockRejectedValue(Object.assign(new Error("Network Error"), { request: {} }));

    expect(await flushBeforeLogout(TENANT)).toBe(2);
  });
});
