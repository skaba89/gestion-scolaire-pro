/**
 * Outbox operations — enqueue/read/flush the IndexedDB offline queue
 * (Phase 6, WhatsApp/offline hardening brief).
 *
 * Règles de sécurité (issue #23, préservées depuis l'ancienne file
 * localStorage) :
 * - chaque entrée est liée à un utilisateur + tenant ; au flush, les
 *   entrées d'un autre tenant que le tenant courant sont ignorées ;
 * - la file est purgée au logout (auth:clear-cache) ;
 * - taille bornée (cap) pour ne pas saturer le stockage.
 *
 * Nouveau vs. l'ancienne file : chaque action porte une idempotencyKey
 * stable, envoyée en en-tête X-Idempotency-Key à chaque tentative — un
 * flush rejoué après une coupure réseau en plein envoi ne peut plus créer
 * deux fois la même présence côté serveur (voir app/core/idempotency.py).
 */
import { apiClient } from "@/api/client";
import { offlineDb, type OfflineAction } from "./db";

export const OFFLINE_QUEUE_CAP = 200;

export interface FlushResult {
  sent: number;
  rejected: OfflineAction[];
  remaining: number;
}

/** Erreur axios sans réponse HTTP = problème réseau (offline, DNS, timeout). */
export function isNetworkError(error: unknown): boolean {
  const err = error as { response?: unknown; request?: unknown } | null;
  return !!err && typeof err === "object" && "request" in (err as object) && !err.response;
}

function newId(): string {
  return crypto.randomUUID();
}

export async function getQueuedActions(): Promise<OfflineAction[]> {
  return offlineDb.offline_actions.orderBy("createdAt").toArray();
}

export async function queueLength(): Promise<number> {
  return offlineDb.offline_actions.count();
}

export async function enqueueAction(
  action: Pick<OfflineAction, "kind" | "method" | "url" | "body" | "dedupeKey" | "tenantId" | "userId">,
): Promise<OfflineAction> {
  const now = new Date().toISOString();
  const entry: OfflineAction = {
    ...action,
    id: newId(),
    idempotencyKey: newId(),
    status: "PENDING",
    retryCount: 0,
    createdAt: now,
    lastAttemptAt: null,
    syncedAt: null,
  };

  await offlineDb.transaction("rw", offlineDb.offline_actions, async () => {
    if (entry.dedupeKey) {
      // A new action with the same dedupeKey replaces the previous one —
      // the idempotencyKey is regenerated too, since this is a genuinely
      // new payload (e.g. a corrected attendance status), not a retry.
      await offlineDb.offline_actions.where("dedupeKey").equals(entry.dedupeKey).delete();
    }
    await offlineDb.offline_actions.add(entry);

    const count = await offlineDb.offline_actions.count();
    if (count > OFFLINE_QUEUE_CAP) {
      const excess = count - OFFLINE_QUEUE_CAP;
      const oldest = await offlineDb.offline_actions.orderBy("createdAt").limit(excess).primaryKeys();
      await offlineDb.offline_actions.bulkDelete(oldest);
    }
  });

  return entry;
}

/** Purge complète (logout / changement d'utilisateur). */
export async function clearOfflineQueue(): Promise<void> {
  await offlineDb.offline_actions.clear();
}

type HttpClient = {
  post: (url: string, body?: unknown, config?: unknown) => Promise<unknown>;
  patch: (url: string, body?: unknown, config?: unknown) => Promise<unknown>;
  put: (url: string, body?: unknown, config?: unknown) => Promise<unknown>;
};

/**
 * Rejoue la file séquentiellement (ordre d'insertion).
 *
 * - succès → retirée de la file ;
 * - réponse 4xx/5xx → rejetée définitivement (le serveur a tranché) ;
 * - erreur réseau → on s'arrête là, le reste attend le prochain flush ;
 * - tenant différent du tenant courant → ignorée et retirée (sécurité).
 */
export async function flushOfflineQueue(
  currentTenantId: string | null | undefined,
  client: HttpClient = apiClient,
): Promise<FlushResult> {
  const queue = await offlineDb.offline_actions.orderBy("createdAt").toArray();
  if (queue.length === 0) return { sent: 0, rejected: [], remaining: 0 };

  const rejected: OfflineAction[] = [];
  let sent = 0;
  let remaining = queue.length;

  for (const action of queue) {
    if (!currentTenantId || action.tenantId !== currentTenantId) {
      // Brouillon d'un autre contexte — jamais rejoué.
      await offlineDb.offline_actions.delete(action.id);
      remaining -= 1;
      continue;
    }

    const config = { headers: { "X-Idempotency-Key": action.idempotencyKey } };
    try {
      if (action.method === "POST") await client.post(action.url, action.body, config);
      else if (action.method === "PATCH") await client.patch(action.url, action.body, config);
      else await client.put(action.url, action.body, config);
      sent += 1;
      await offlineDb.offline_actions.delete(action.id);
      remaining -= 1;
    } catch (error) {
      if (isNetworkError(error)) {
        // Toujours hors ligne : on s'arrête ici, celle-ci et les suivantes
        // attendent le prochain flush.
        break;
      }
      // Le serveur a refusé (validation, permission, conflit) : on
      // abandonne ce brouillon — il ne sera jamais forcé.
      rejected.push(action);
      await offlineDb.offline_actions.delete(action.id);
      remaining -= 1;
    }
  }

  return { sent, rejected, remaining };
}
