/**
 * Purge des données hors ligne à la déconnexion (O1, lot hors-ligne n°1).
 *
 * Règle : rien ne survit à la déconnexion ni au changement d'utilisateur.
 * Jusqu'ici seule la file d'envoi (schoolflow-offline) était vidée ; les
 * élèves mis en cache par la page Présences (noms de mineurs), les présences
 * et notes en attente (SchoolFlowOfflineDB) et l'ancienne base SchoolFlowDB
 * restaient lisibles par l'utilisateur suivant d'un poste partagé.
 *
 * Avant de purger, on tente d'envoyer ce qui peut l'être (si le réseau est
 * là), puis on compte ce qui sera perdu pour le dire à l'utilisateur.
 */
import { db as legacyDb } from "@/lib/db";
import { getPendingCounts, offlineDb as draftsDb } from "@/lib/offlineDb";
import { offlineDb as outboxDb } from "./db";
import { syncPendingDrafts } from "./draftSync";
import { flushOfflineQueue } from "./outbox";

/** Délai maximal accordé à l'envoi avant déconnexion (réseau lent). */
export const LOGOUT_FLUSH_TIMEOUT_MS = 8_000;

/** Saisies hors ligne pas encore acceptées par le serveur, toutes bases. */
export async function countUnsyncedOfflineWork(): Promise<number> {
  const [outbox, drafts, legacy] = await Promise.all([
    outboxDb.offline_actions.where("status").anyOf("PENDING", "SYNCING").count(),
    getPendingCounts().then((c) => c.total),
    legacyDb.syncQueue.count(),
  ]);
  return outbox + drafts + legacy;
}

/** Vide toutes les bases hors ligne. Chaque table est vidée indépendamment :
 * un échec est journalisé (jamais ignoré en silence) sans empêcher le reste. */
export async function purgeAllOfflineData(): Promise<void> {
  const tables = [outboxDb.offline_actions, ...draftsDb.tables, ...legacyDb.tables];
  const results = await Promise.allSettled(tables.map((t) => t.clear()));
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`[offline] purge incomplète de « ${tables[i].name} »`, r.reason);
    }
  });
}

/**
 * Juste avant la déconnexion (jeton encore valide) : envoie la file et les
 * brouillons si le réseau est disponible, dans un délai borné, puis renvoie
 * le nombre de saisies qui ne pourront pas être envoyées.
 */
export async function flushBeforeLogout(tenantId: string | null): Promise<number> {
  if (navigator.onLine) {
    const attempt = (async () => {
      if (tenantId) await flushOfflineQueue(tenantId);
      await syncPendingDrafts();
    })();
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, LOGOUT_FLUSH_TIMEOUT_MS));
    try {
      await Promise.race([attempt, timeout]);
    } catch (error) {
      console.error("[offline] envoi avant déconnexion impossible", error);
    }
  }
  return countUnsyncedOfflineWork();
}
