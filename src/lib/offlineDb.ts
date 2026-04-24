/**
 * SchoolFlow Pro — Offline Database (Dexie / IndexedDB)
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
  synced: 0 | 1;               // Dexie indexes numbers, not booleans
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
  data: Omit<PendingAttendance, "id" | "createdAt" | "synced" | "retries">
): Promise<number> {
  return offlineDb.pendingAttendance.add({
    ...data,
    createdAt: Date.now(),
    synced: 0,
    retries: 0,
  });
}

// ── Helper: add offline grade ──────────────────────────────────────────────────

export async function queueGrade(
  data: Omit<PendingGrade, "id" | "createdAt" | "synced" | "retries">
): Promise<number> {
  return offlineDb.pendingGrades.add({
    ...data,
    createdAt: Date.now(),
    synced: 0,
    retries: 0,
  });
}

// ── Helper: pending counts ─────────────────────────────────────────────────────

export async function getPendingCounts(): Promise<{
  attendance: number;
  grades: number;
  total: number;
}> {
  const [attendance, grades] = await Promise.all([
    offlineDb.pendingAttendance.where("synced").equals(0).count(),
    offlineDb.pendingGrades.where("synced").equals(0).count(),
  ]);
  return { attendance, grades, total: attendance + grades };
}
