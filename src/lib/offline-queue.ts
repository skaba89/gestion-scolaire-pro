/**
 * File d'actions offline — Phase 6, PR 4 (issue #23).
 *
 * Quand une action simple (pointage de présence) échoue faute de réseau,
 * elle est mise en brouillon local puis rejouée séquentiellement au retour
 * du réseau. Le serveur revalide TOUT à la synchronisation (auth,
 * permissions, tenant) : un brouillon rejeté en 4xx est abandonné et
 * signalé, jamais forcé.
 *
 * Règles de sécurité (issue #23) :
 * - chaque entrée est liée à un utilisateur + tenant ; au flush, les
 *   entrées d'un autre tenant que le tenant courant sont ignorées ;
 * - la file est purgée au logout (auth:clear-cache) — les brouillons non
 *   synchronisés ne survivent pas à un changement d'utilisateur ;
 * - taille bornée (cap) pour ne pas saturer le stockage.
 */
import { apiClient } from "@/api/client";

export const OFFLINE_QUEUE_KEY = "schoolflow:offline-queue";
export const OFFLINE_QUEUE_CAP = 200;

export interface QueuedAction {
  id: string;
  /** Type métier de l'action (extensible : "attendance", …). */
  kind: string;
  method: "POST" | "PATCH" | "PUT";
  url: string;
  body: Record<string, unknown>;
  /** Une nouvelle action avec la même dedupeKey remplace l'ancienne. */
  dedupeKey?: string;
  tenantId: string;
  userId: string | null;
  createdAt: string;
}

export interface FlushResult {
  sent: number;
  rejected: QueuedAction[];
  remaining: number;
}

function readQueue(): QueuedAction[] {
  try {
    const raw = window.localStorage.getItem(OFFLINE_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedAction[]): void {
  try {
    window.localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Stockage plein/indisponible — l'action est perdue, l'appelant a déjà
    // été informé que le brouillon n'est pas garanti.
  }
}

export function getQueuedActions(): QueuedAction[] {
  return readQueue();
}

export function queueLength(): number {
  return readQueue().length;
}

/** Erreur axios sans réponse HTTP = problème réseau (offline, DNS, timeout). */
export function isNetworkError(error: unknown): boolean {
  const err = error as { response?: unknown; request?: unknown } | null;
  return !!err && typeof err === "object" && "request" in (err as object) && !err.response;
}

export function enqueueAction(
  action: Omit<QueuedAction, "id" | "createdAt">,
): QueuedAction {
  const entry: QueuedAction = {
    ...action,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  let queue = readQueue();
  if (entry.dedupeKey) {
    queue = queue.filter((a) => a.dedupeKey !== entry.dedupeKey);
  }
  queue.push(entry);
  // Cap : on garde les actions les plus récentes.
  if (queue.length > OFFLINE_QUEUE_CAP) {
    queue = queue.slice(queue.length - OFFLINE_QUEUE_CAP);
  }
  writeQueue(queue);
  return entry;
}

/** Purge complète (logout / changement d'utilisateur). */
export function clearOfflineQueue(): void {
  try {
    window.localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch {
    // rien à faire
  }
}

type HttpClient = {
  post: (url: string, body?: unknown) => Promise<unknown>;
  patch: (url: string, body?: unknown) => Promise<unknown>;
  put: (url: string, body?: unknown) => Promise<unknown>;
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
  const queue = readQueue();
  if (queue.length === 0) return { sent: 0, rejected: [], remaining: 0 };

  const rejected: QueuedAction[] = [];
  let sent = 0;
  let index = 0;

  while (index < queue.length) {
    const action = queue[index];

    if (!currentTenantId || action.tenantId !== currentTenantId) {
      // Brouillon d'un autre contexte — jamais rejoué.
      queue.splice(index, 1);
      continue;
    }

    try {
      if (action.method === "POST") await client.post(action.url, action.body);
      else if (action.method === "PATCH") await client.patch(action.url, action.body);
      else await client.put(action.url, action.body);
      sent += 1;
      queue.splice(index, 1);
    } catch (error) {
      if (isNetworkError(error)) {
        // Toujours hors ligne : on garde cette action et les suivantes.
        break;
      }
      // Le serveur a refusé (validation, permission, conflit) : on abandonne
      // ce brouillon — il ne sera jamais forcé.
      rejected.push(action);
      queue.splice(index, 1);
    }
  }

  writeQueue(queue);
  return { sent, rejected, remaining: queue.length };
}
