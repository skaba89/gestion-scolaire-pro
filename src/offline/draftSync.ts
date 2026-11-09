/**
 * Synchronisation des brouillons hors ligne de SchoolFlowOfflineDB
 * (présences et notes en attente), sans dépendance React.
 *
 * Extrait de useOfflineSync pour pouvoir être appelé hors d'un composant,
 * notamment juste avant la déconnexion (purge des données hors ligne,
 * src/offline/purge.ts). Comportement inchangé : même clé d'idempotence
 * (localId) à chaque renvoi, 409 = conflit terminal, erreur réseau = reste
 * PENDING sans pénalité.
 */
import { apiClient } from "@/api/client";
import { offlineDb, type PendingAttendance, type PendingGrade } from "@/lib/offlineDb";
import { isNetworkError } from "./outbox";

const MAX_RETRIES = 3;

export interface DraftSyncResult {
  synced: number;
  failed: number;
  conflicts: number;
}

let running: Promise<DraftSyncResult> | null = null;

// ── Sync one attendance record ───────────────────────────────────────────
// Returns "synced" | "conflict" | "rejected" | "network" — the caller
// decides how each outcome counts towards synced/failed/conflicts.

export type SyncOutcome = "synced" | "conflict" | "rejected" | "network";

async function syncAttendance(item: PendingAttendance): Promise<SyncOutcome> {
  await offlineDb.pendingAttendance.update(item.id!, { syncStatus: "SYNCING" });
  try {
    await apiClient.post(
      "/attendance/",
      {
        student_id: item.studentId,
        classroom_id: item.classroomId,
        subject_id: item.subjectId,
        date: item.date,
        status: item.status,
        reason: item.reason,
      },
      // The backend reads the idempotency key from this header, never
      // from the request body (see app/core/idempotency.py) — a body
      // field is silently ignored by Pydantic and never deduplicates.
      { headers: { "X-Idempotency-Key": item.localId } },
    );

    await offlineDb.pendingAttendance.update(item.id!, {
      synced: 1,
      syncStatus: "SYNCED",
      syncedAt: Date.now(),
      syncError: undefined,
      conflict: false,
    });
    return "synced";
  } catch (error: any) {
    if (isNetworkError(error)) {
      // Still offline — no penalty, no message, stays PENDING, retried
      // on the next sync.
      await offlineDb.pendingAttendance.update(item.id!, { syncStatus: "PENDING" });
      return "network";
    }

    // A 409 here means app/core/idempotency.py's get_idempotent_response_or_lock()
    // saw this same X-Idempotency-Key already used with a DIFFERENT
    // body — a real conflict (e.g. someone else already marked this
    // student's attendance for this date), NEVER a success. Previously
    // this branch silently marked the draft as synced=1 and hid it.
    const isConflict = error?.response?.status === 409;
    const retries = (item.retries || 0) + 1;
    const exhausted = retries >= MAX_RETRIES;

    await offlineDb.pendingAttendance.update(item.id!, {
      synced: 0,
      syncStatus: isConflict || exhausted ? "REJECTED" : "PENDING",
      conflict: isConflict,
      retries,
      syncError: isConflict
        ? "Conflit : cette présence a déjà été enregistrée avec un contenu différent. Non synchronisée — vérifiez avant de ressaisir."
        : String(error?.response?.data?.detail || error?.message || "Erreur inconnue"),
    });
    return isConflict ? "conflict" : "rejected";
  }
}

// ── Sync one grade record ─────────────────────────────────────────────────

async function syncGrade(item: PendingGrade): Promise<SyncOutcome> {
  await offlineDb.pendingGrades.update(item.id!, { syncStatus: "SYNCING" });
  try {
    await apiClient.post(
      "/grades/",
      {
        student_id: item.studentId,
        subject_id: item.subjectId,
        assessment_id: item.assessmentId,
        score: item.score,
        max_score: item.maxScore,
        coefficient: item.coefficient,
        comments: item.comments,
      },
      { headers: { "X-Idempotency-Key": item.localId } },
    );

    await offlineDb.pendingGrades.update(item.id!, {
      synced: 1,
      syncStatus: "SYNCED",
      syncedAt: Date.now(),
      syncError: undefined,
      conflict: false,
    });
    return "synced";
  } catch (error: any) {
    if (isNetworkError(error)) {
      await offlineDb.pendingGrades.update(item.id!, { syncStatus: "PENDING" });
      return "network";
    }

    // Same reasoning as syncAttendance() above — a 409 is a real
    // conflict, never a silent success.
    const isConflict = error?.response?.status === 409;
    const retries = (item.retries || 0) + 1;
    const exhausted = retries >= MAX_RETRIES;

    await offlineDb.pendingGrades.update(item.id!, {
      synced: 0,
      syncStatus: isConflict || exhausted ? "REJECTED" : "PENDING",
      conflict: isConflict,
      retries,
      syncError: isConflict
        ? "Conflit : cette note a déjà été enregistrée avec un contenu différent. Non synchronisée — vérifiez avant de ressaisir."
        : String(error?.response?.data?.detail || error?.message || "Erreur inconnue"),
    });
    return isConflict ? "conflict" : "rejected";
  }
}

async function runSync(): Promise<DraftSyncResult> {
  let synced = 0;
  let failed = 0;
  let conflicts = 0;

  const isRetryable = (item: { synced: 0 | 1; syncStatus?: string }) =>
    item.synced === 0 && (item.syncStatus ?? "PENDING") === "PENDING";

  // ── Sync attendance ───────────────────────────────────────────────────
  // Filters on syncStatus (not just retries < MAX) so a REJECTED item
  // (server refusal, incl. a 409 conflict) is never retried again —
  // it's a terminal state, not "still pending".
  const pendingAttendance = await offlineDb.pendingAttendance
    .where("synced")
    .equals(0)
    .and(isRetryable)
    .toArray();

  for (const item of pendingAttendance) {
    const outcome = await syncAttendance(item);
    if (outcome === "synced") synced++;
    else if (outcome === "conflict") conflicts++;
    else if (outcome === "rejected") failed++;
    // "network" outcome counts as neither — retried next sync, no penalty.
  }

  // ── Sync grades ───────────────────────────────────────────────────────
  const pendingGrades = await offlineDb.pendingGrades
    .where("synced")
    .equals(0)
    .and(isRetryable)
    .toArray();

  for (const item of pendingGrades) {
    const outcome = await syncGrade(item);
    if (outcome === "synced") synced++;
    else if (outcome === "conflict") conflicts++;
    else if (outcome === "rejected") failed++;
  }

  // ── Clean up old resolved records (keep last 7 days) ──────────────────
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  await offlineDb.pendingAttendance
    .where("synced").equals(1)
    .and((item) => (item.syncedAt || 0) < cutoff)
    .delete();
  await offlineDb.pendingGrades
    .where("synced").equals(1)
    .and((item) => (item.syncedAt || 0) < cutoff)
    .delete();
  await offlineDb.pendingAttendance
    .where("syncStatus").equals("REJECTED")
    .and((item) => (item.createdAt || 0) < cutoff)
    .delete();
  await offlineDb.pendingGrades
    .where("syncStatus").equals("REJECTED")
    .and((item) => (item.createdAt || 0) < cutoff)
    .delete();

  return { synced, failed, conflicts };
}

/** Envoie les brouillons en attente. Un seul envoi à la fois : un appel
 * concurrent attend le même résultat au lieu de renvoyer les mêmes lignes. */
export function syncPendingDrafts(): Promise<DraftSyncResult> {
  if (!running) {
    running = runSync().finally(() => {
      running = null;
    });
  }
  return running;
}
