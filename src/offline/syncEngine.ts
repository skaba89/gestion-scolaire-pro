/**
 * Boot-time migration + sync trigger for the offline outbox (Phase 6,
 * WhatsApp/offline hardening brief).
 *
 * migrateLegacyQueue() runs once at app startup: any drafts still sitting
 * in the old localStorage queue (schoolflow:offline-queue) are moved into
 * IndexedDB and the old key is removed — a user who goes offline right
 * before this deploy ships doesn't lose their queued attendance marks.
 */
import { offlineDb, type OfflineAction } from "./db";
import { flushOfflineQueue, type FlushResult } from "./outbox";

const LEGACY_QUEUE_KEY = "schoolflow:offline-queue";

interface LegacyQueuedAction {
  id?: string;
  kind: string;
  method: "POST" | "PATCH" | "PUT";
  url: string;
  body: Record<string, unknown>;
  dedupeKey?: string;
  tenantId: string;
  userId: string | null;
  createdAt?: string;
}

/** Idempotent — safe to call on every boot; a no-op once the legacy key
 * is gone (the common case after the first run post-deploy). */
export async function migrateLegacyQueue(): Promise<number> {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(LEGACY_QUEUE_KEY);
  } catch {
    return 0;
  }
  if (!raw) return 0;

  let legacy: LegacyQueuedAction[];
  try {
    const parsed = JSON.parse(raw);
    legacy = Array.isArray(parsed) ? parsed : [];
  } catch {
    legacy = [];
  }

  if (legacy.length > 0) {
    const now = new Date().toISOString();
    const migrated: OfflineAction[] = legacy.map((a) => ({
      id: crypto.randomUUID(),
      tenantId: a.tenantId,
      userId: a.userId ?? null,
      kind: a.kind,
      method: a.method,
      url: a.url,
      body: a.body,
      idempotencyKey: crypto.randomUUID(),
      dedupeKey: a.dedupeKey,
      status: "PENDING",
      retryCount: 0,
      createdAt: a.createdAt ?? now,
      lastAttemptAt: null,
      syncedAt: null,
    }));
    await offlineDb.offline_actions.bulkAdd(migrated);
  }

  try {
    window.localStorage.removeItem(LEGACY_QUEUE_KEY);
  } catch {
    // rien à faire — la clé legacy restera, sans conséquence : elle n'est
    // plus jamais lue par le reste de l'app.
  }
  return legacy.length;
}

export { flushOfflineQueue, type FlushResult };
export { enqueueAction, clearOfflineQueue, getQueuedActions, queueLength, isNetworkError } from "./outbox";
export type { OfflineAction, OfflineActionStatus } from "./db";
