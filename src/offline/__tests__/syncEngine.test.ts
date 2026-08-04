/** migrateLegacyQueue() — moves drafts left in the old localStorage queue
 * (schoolflow:offline-queue) into IndexedDB at boot, once (Phase 6). */
import { beforeEach, describe, expect, it } from "vitest";

import { offlineDb } from "@/offline/db";
import { getQueuedActions } from "@/offline/outbox";
import { migrateLegacyQueue } from "@/offline/syncEngine";

const LEGACY_KEY = "schoolflow:offline-queue";

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

beforeEach(async () => {
  installFunctionalStorage();
  await offlineDb.offline_actions.clear();
});

describe("migrateLegacyQueue", () => {
  it("déplace les brouillons legacy vers IndexedDB puis retire la clé localStorage", async () => {
    window.localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify([
        {
          id: "old-1",
          kind: "attendance",
          method: "POST",
          url: "/attendance/",
          body: { student_id: "s1", status: "PRESENT" },
          dedupeKey: "attendance:c1:2026-07-15:s1",
          tenantId: "tenant-1",
          userId: "user-1",
          createdAt: "2026-07-15T08:00:00.000Z",
        },
      ]),
    );

    const migratedCount = await migrateLegacyQueue();

    expect(migratedCount).toBe(1);
    const queue = await getQueuedActions();
    expect(queue).toHaveLength(1);
    expect(queue[0].body.student_id).toBe("s1");
    expect(queue[0].idempotencyKey).toBeTruthy();
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("ne fait rien si aucune clé legacy n'existe", async () => {
    const migratedCount = await migrateLegacyQueue();
    expect(migratedCount).toBe(0);
    expect(await getQueuedActions()).toHaveLength(0);
  });

  it("est idempotente — un second appel après migration ne duplique rien", async () => {
    window.localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify([{
        kind: "attendance", method: "POST", url: "/attendance/",
        body: { student_id: "s1" }, tenantId: "tenant-1", userId: "user-1",
      }]),
    );

    await migrateLegacyQueue();
    await migrateLegacyQueue();

    const queue = await getQueuedActions();
    expect(queue).toHaveLength(1);
  });
});
