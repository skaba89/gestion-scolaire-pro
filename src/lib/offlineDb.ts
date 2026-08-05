/**
 * Academy Guinéenne — Offline Database (Dexie / IndexedDB)
 *
 * Tables:
 *   pendingAttendance  — absences saisies hors-ligne, à synchroniser
 *   pendingGrades      — notes saisies hors-ligne, à synchroniser
 *   cachedStudents     — référentiel élèves pour usage hors-ligne
 *   cachedClassrooms   — référentiel classes
 *   cachedSubjects     — référentiel matières
 *
 * Usage:
 *   import { offlineDb } from "@/lib/offlineDb";
 *   await offlineDb.pendingAttendance.add({ ... });
 *   const pending = await offlineDb.pendingAttendance.where({ synced: 0 }).toArray();
 */

import Dexie, { type EntityTable } from "dexie";

// ── Record types ───────────────────────────────────────────────────────────────

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

/** Visible sync status, independent from the legacy `synced` 0|1 flag kept
 * for backward compatibility. PENDING → SYNCING (mid-request) → SYNCED
 * (done) or REJECTED (terminal — server refused, incl. a genuine 409
 * conflict, or retries exhausted). Never silently disappears. */
export type SyncStatus = "PENDING" | "SYNCING" | "SYNCED" | "REJECTED";

export interface PendingAttendance {
  id?: number;                  // auto-increment PK
  localId: string;              // client-generated UUID (idempotency key)
  tenantId: string;
  studentId: string;
  classroomId: string;
  subjectId?: string;
  date: string;                 // "YYYY-MM-DD"
  status: AttendanceStatus;
  reason?: string;
  createdAt: number;            // Date.now()
  synced: 0 | 1;               // Dexie indexes numbers, not booleans — kept for backward compat, derived from syncStatus
  syncStatus?: SyncStatus;       // optional so pre-existing rows (no migration needed) default via code, not schema
  /** True when REJECTED came from a 409 — the idempotency key was replayed
   * with a DIFFERENT body (see app/core/idempotency.py). This used to be
   * silently treated as a success ("already exists") — it is a real
   * conflict the user must see, not a synced item. */
  conflict?: boolean;
  syncedAt?: number;
  syncError?: string;
  retries: number;
}

export interface PendingGrade {
  id?: number;
  localId: string;
  tenantId: string;
  studentId: string;
  subjectId: string;
  assessmentId?: string;
  score: number;
  maxScore: number;
  coefficient: number;
  comments?: string;
  createdAt: number;
  synced: 0 | 1;
  syncStatus?: SyncStatus;
  conflict?: boolean;
  syncedAt?: number;
  syncError?: string;
  retries: number;
}

export interface CachedStudent {
  id: string;                   // server UUID (primary key)
  tenantId: string;
  firstName: string;
  lastName: string;
  registrationNumber?: string;
  classroomId?: string;
  gender?: string;
  status?: string;
  cachedAt: number;
}

export interface CachedClassroom {
  id: string;
  tenantId: string;
  name: string;
  levelName?: string;
  levelId?: string;
  cachedAt: number;
}

export interface CachedSubject {
  id: string;
  tenantId: string;
  name: string;
  coefficient: number;
  cachedAt: number;
}

// ── Dexie DB class ─────────────────────────────────────────────────────────────

class SchoolFlowOfflineDB extends Dexie {
  pendingAttendance!: EntityTable<PendingAttendance, "id">;
  pendingGrades!: EntityTable<PendingGrade, "id">;
  cachedStudents!: EntityTable<CachedStudent, "id">;
  cachedClassrooms!: EntityTable<CachedClassroom, "id">;
  cachedSubjects!: EntityTable<CachedSubject, "id">;

  constructor() {
    super("SchoolFlowOfflineDB");

    this.version(1).stores({
      // Pending sync queues
      pendingAttendance:
        "++id, localId, tenantId, studentId, classroomId, date, synced, createdAt",
      pendingGrades:
        "++id, localId, tenantId, studentId, subjectId, synced, createdAt",
      // Reference data caches (keyed by server UUID)
      cachedStudents:  "id, tenantId, classroomId, cachedAt",
      cachedClassrooms: "id, tenantId, cachedAt",
      cachedSubjects:  "id, tenantId, cachedAt",
    });

    // v2 — adds syncStatus (PENDING/SYNCING/SYNCED/REJECTED), indexed, so a
    // permanently refused draft (incl. a real 409 conflict, previously
    // silently marked as a synced success) stops counting as "pending"
    // forever while staying queryable/visible. Existing rows keep
    // syncStatus undefined; getPendingCounts() falls back to the legacy
    // `synced` flag for those.
    this.version(2).stores({
      pendingAttendance:
        "++id, localId, tenantId, studentId, classroomId, date, synced, syncStatus, createdAt",
      pendingGrades:
        "++id, localId, tenantId, studentId, subjectId, synced, syncStatus, createdAt",
    });
  }
}

export const offlineDb = new SchoolFlowOfflineDB();

// ── Helper: cache reference data ───────────────────────────────────────────────

export async function cacheStudents(
  tenantId: string,
  students: Array<Omit<CachedStudent, "cachedAt">>
) {
  const now = Date.now();
  await offlineDb.cachedStudents.bulkPut(
    students.map((s) => ({ ...s, tenantId, cachedAt: now }))
  );
}

export async function cacheClassrooms(
  tenantId: string,
  classrooms: Array<Omit<CachedClassroom, "cachedAt">>
) {
  const now = Date.now();
  await offlineDb.cachedClassrooms.bulkPut(
    classrooms.map((c) => ({ ...c, tenantId, cachedAt: now }))
  );
}

export async function cacheSubjects(
  tenantId: string,
  subjects: Array<Omit<CachedSubject, "cachedAt">>
) {
  const now = Date.now();
  await offlineDb.cachedSubjects.bulkPut(
    subjects.map((s) => ({ ...s, tenantId, cachedAt: now }))
  );
}

// ── Helper: add offline attendance ─────────────────────────────────────────────

export async function queueAttendance(
  data: Omit<PendingAttendance, "id" | "createdAt" | "synced" | "retries" | "syncStatus">
): Promise<number> {
  return offlineDb.pendingAttendance.add({
    ...data,
    createdAt: Date.now(),
    synced: 0,
    syncStatus: "PENDING",
    retries: 0,
  });
}

// ── Helper: add offline grade ──────────────────────────────────────────────────

export async function queueGrade(
  data: Omit<PendingGrade, "id" | "createdAt" | "synced" | "retries" | "syncStatus">
): Promise<number> {
  return offlineDb.pendingGrades.add({
    ...data,
    createdAt: Date.now(),
    synced: 0,
    syncStatus: "PENDING",
    retries: 0,
  });
}

// ── Helper: pending counts ─────────────────────────────────────────────────────
//
// Counts rows still needing action — PENDING or SYNCING, but NOT the
// terminal REJECTED state (a permanently refused draft, including a 409
// conflict, must stop showing up as "pending" forever once resolved).
// Rows written before syncStatus existed have no value for it — treated as
// PENDING (their `synced` flag is still the source of truth for them).

function _isActionable(row: { synced: 0 | 1; syncStatus?: SyncStatus }): boolean {
  if (row.syncStatus) return row.syncStatus === "PENDING" || row.syncStatus === "SYNCING";
  return row.synced === 0;
}

export async function getPendingCounts(): Promise<{
  attendance: number;
  grades: number;
  total: number;
}> {
  const [attendanceRows, gradeRows] = await Promise.all([
    offlineDb.pendingAttendance.where("synced").equals(0).toArray(),
    offlineDb.pendingGrades.where("synced").equals(0).toArray(),
  ]);
  const attendance = attendanceRows.filter(_isActionable).length;
  const grades = gradeRows.filter(_isActionable).length;
  return { attendance, grades, total: attendance + grades };
}

/** Rejected drafts (server refusal, incl. 409 conflicts) — kept visible for
 * a "brouillons refusés" panel instead of vanishing. */
export async function getRejectedDrafts(): Promise<{
  attendance: PendingAttendance[];
  grades: PendingGrade[];
}> {
  const [attendance, grades] = await Promise.all([
    offlineDb.pendingAttendance.where("syncStatus").equals("REJECTED").toArray(),
    offlineDb.pendingGrades.where("syncStatus").equals("REJECTED").toArray(),
  ]);
  return { attendance, grades };
}
