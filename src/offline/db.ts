/**
 * IndexedDB-backed offline outbox (Phase 6, WhatsApp/offline hardening
 * brief) — replaces the localStorage-based queue (src/lib/offline-queue.ts,
 * now removed). localStorage has a small size cap and is fully synchronous
 * (blocks the main thread on every read/write); IndexedDB scales to a real
 * outbox and matches the async nature of the sync engine.
 */
import Dexie, { type Table } from "dexie";

export type OfflineActionStatus = "PENDING" | "SYNCING" | "SYNCED" | "REJECTED";

export interface OfflineAction {
  id: string;
  tenantId: string;
  userId: string | null;
  /** Business kind of the action (extensible: "attendance", …). */
  kind: string;
  method: "POST" | "PATCH" | "PUT";
  url: string;
  body: Record<string, unknown>;
  /** Sent as X-Idempotency-Key on every (re)send — same key, same body,
   * same response, per app/core/idempotency.py on the backend. */
  idempotencyKey: string;
  /** A new action with the same dedupeKey replaces the previous one. */
  dedupeKey?: string;
  status: OfflineActionStatus;
  /** True when the terminal REJECTED status came from a 409 (the backend's
   * idempotency layer replaying the same key with a different body) — a
   * real conflict the user must be told about explicitly, not a generic
   * "the server said no" (see app/core/idempotency.py::get_idempotent_response_or_lock).
   */
  conflict?: boolean;
  error?: string;
  retryCount: number;
  createdAt: string;
  lastAttemptAt: string | null;
  syncedAt: string | null;
}

class OfflineDatabase extends Dexie {
  offline_actions!: Table<OfflineAction, string>;

  constructor() {
    super("schoolflow-offline");
    this.version(1).stores({
      // Primary key `id`; indexes on the fields the outbox queries by.
      offline_actions: "id, tenantId, dedupeKey, status, createdAt",
    });
  }
}

export const offlineDb = new OfflineDatabase();
