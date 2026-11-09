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
import Dexie from "dexie";
import { getPendingCounts, offlineDb as draftsDb } from "@/lib/offlineDb";
import { offlineDb as outboxDb } from "./db";
import { syncPendingDrafts } from "./draftSync";
import { flushOfflineQueue } from "./outbox";

/** Ancienne base « SchoolFlowDB » (file factice de usePWA, retirée en O6) :
 * rien ne l'alimentait plus ; elle peut subsister sur des appareils. */
export const LEGACY_DATABASE = "SchoolFlowDB";

/**
 * Retire l'ancienne base. Au démarrage (`force` faux), uniquement si elle ne
 * contient aucune opération en attente — sinon elle est conservée et
 * l'anomalie journalisée. À la déconnexion (`force` vrai), toujours.
 * Renvoie vrai si la base n'existe plus.
 */
export async function retireLegacyDatabase({ force = false } = {}): Promise<boolean> {
  if (!(await Dexie.exists(LEGACY_DATABASE))) return true;
  if (!force) {
    const legacy = new Dexie(LEGACY_DATABASE);
    try {
      await legacy.open(); // schéma existant, sans le redéclarer
      const pending = legacy.tables.some((t) => t.name === "syncQueue")
        ? await legacy.table("syncQueue").count()
        : 0;
      if (pending > 0) {
        console.warn(`[offline] ${LEGACY_DATABASE} conservée : ${pending} opération(s) non envoyée(s)`);
        return false;
      }
    } finally {
      legacy.close();
    }
  }
  await Dexie.delete(LEGACY_DATABASE);
  return true;
}

/** Délai maximal accordé à l'envoi avant déconnexion (réseau lent). */
export const LOGOUT_FLUSH_TIMEOUT_MS = 8_000;

/** Saisies hors ligne pas encore acceptées par le serveur, toutes bases. */
export async function countUnsyncedOfflineWork(): Promise<number> {
  const [outbox, drafts] = await Promise.all([
    outboxDb.offline_actions.where("status").anyOf("PENDING", "SYNCING").count(),
    getPendingCounts().then((c) => c.total),
  ]);
  return outbox + drafts;
}

/** Vide toutes les bases hors ligne. Chaque table est vidée indépendamment :
 * un échec est journalisé (jamais ignoré en silence) sans empêcher le reste. */
export async function purgeAllOfflineData(): Promise<void> {
  const tables = [outboxDb.offline_actions, ...draftsDb.tables];
  const results = await Promise.allSettled(tables.map((t) => t.clear()));
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`[offline] purge incomplète de « ${tables[i].name} »`, r.reason);
    }
  });
  try {
    await retireLegacyDatabase({ force: true });
  } catch (error) {
    console.error(`[offline] suppression de ${LEGACY_DATABASE} impossible`, error);
  }
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
