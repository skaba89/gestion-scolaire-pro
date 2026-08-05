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

/** Full history — every status, including resolved (SYNCED/REJECTED) rows
 * still within their retention window. Use this for a "brouillons"/drafts
 * UI that must show PENDING/SYNCING/SYNCED/REJECTED, not just what's left
 * to send. */
export async function getQueuedActions(): Promise<OfflineAction[]> {
  return offlineDb.offline_actions.orderBy("createdAt").toArray();
}

/** Rows terminally rejected by the server (including 409 conflicts) —
 * kept after a flush instead of being silently deleted, so the UI can
 * surface them instead of a draft just vanishing without explanation. */
export async function getRejectedActions(): Promise<OfflineAction[]> {
  return offlineDb.offline_actions.where("status").equals("REJECTED").toArray();
}

/** Work still to be attempted — excludes SYNCED/REJECTED (terminal), so a
 * caller like useOfflineQueueSync can tell "nothing left to try" apart
 * from "there's unresolved history sitting around". */
export async function queueLength(): Promise<number> {
  return offlineDb.offline_actions.where("status").equals("PENDING").count();
}

const RESOLVED_RETENTION_MS = 24 * 60 * 60 * 1000; // keep SYNCED/REJECTED visible for 24h

async function pruneOldResolvedActions(): Promise<void> {
  const cutoff = new Date(Date.now() - RESOLVED_RETENTION_MS).toISOString();
  await offlineDb.offline_actions
    .where("status").anyOf("SYNCED", "REJECTED")
    .and((a) => a.createdAt < cutoff)
    .delete();
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
 * Rejoue la file séquentiellement (ordre d'insertion), sur les brouillons
 * encore PENDING uniquement.
 *
 * - succès → statut SYNCED (visible, pas supprimée immédiatement) ;
 * - 409 (conflit d'idempotence — même clé, contenu différent) → statut
 *   REJECTED avec `conflict: true`, affiché distinctement de tout autre
 *   refus serveur ;
 * - autre réponse 4xx/5xx → statut REJECTED (le serveur a tranché,
 *   abandonné définitivement, mais gardé visible) ;
 * - erreur réseau → repasse en PENDING, on s'arrête là, le reste attend
 *   le prochain flush ;
 * - tenant différent du tenant courant → ignorée et retirée (sécurité,
 *   jamais gardée, même pas visible).
 */
export async function flushOfflineQueue(
  currentTenantId: string | null | undefined,
  client: HttpClient = apiClient,
): Promise<FlushResult> {
  await pruneOldResolvedActions();

  const queue = await offlineDb.offline_actions.where("status").equals("PENDING").sortBy("createdAt");
  if (queue.length === 0) return { sent: 0, rejected: [], remaining: 0 };

  const rejected: OfflineAction[] = [];
  let sent = 0;
  let remaining = queue.length;

  for (const action of queue) {
    if (!currentTenantId || action.tenantId !== currentTenantId) {
      // Brouillon d'un autre contexte — jamais rejoué, jamais gardé.
      await offlineDb.offline_actions.delete(action.id);
      remaining -= 1;
      continue;
    }

    await offlineDb.offline_actions.update(action.id, {
      status: "SYNCING",
      lastAttemptAt: new Date().toISOString(),
    });

    const config = { headers: { "X-Idempotency-Key": action.idempotencyKey } };
    try {
      if (action.method === "POST") await client.post(action.url, action.body, config);
      else if (action.method === "PATCH") await client.patch(action.url, action.body, config);
      else await client.put(action.url, action.body, config);
      sent += 1;
      remaining -= 1;
      await offlineDb.offline_actions.update(action.id, {
        status: "SYNCED",
        syncedAt: new Date().toISOString(),
        error: undefined,
      });
    } catch (error) {
      if (isNetworkError(error)) {
        // Toujours hors ligne : on repasse en PENDING et on s'arrête ici —
        // celle-ci et les suivantes attendent le prochain flush.
        await offlineDb.offline_actions.update(action.id, { status: "PENDING" });
        break;
      }
      // Le serveur a refusé (validation, permission, conflit) : abandonné
      // définitivement, mais gardé visible sous statut REJECTED — jamais
      // supprimé silencieusement.
      const status = (error as { response?: { status?: number } })?.response?.status;
      const isConflict = status === 409;
      remaining -= 1;
      await offlineDb.offline_actions.update(action.id, {
        status: "REJECTED",
        conflict: isConflict,
        error: isConflict
          ? "Conflit : cette donnée a déjà été synchronisée avec un contenu différent."
          : `Refusé par le serveur (${status ?? "erreur"}).`,
      });
      rejected.push({ ...action, status: "REJECTED", conflict: isConflict });
    }
  }

  return { sent, rejected, remaining };
}
