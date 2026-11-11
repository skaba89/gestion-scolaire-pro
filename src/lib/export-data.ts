/**
 * Données des « Exports avancés » (page admin/AdvancedExports), lues sur les
 * routes réelles de l'API (2026-11-11).
 *
 * Avant : l'export Enseignants appelait `/hr/staff/` (inexistant) ; les
 * exports Élèves, Notes, Présences et Finances lisaient des pages paginées
 * `{ items }` comme des tableaux et envoyaient des paramètres que le serveur
 * ignore (`student_ids`, `expand`, `fields`, `class_id` pour les présences) ;
 * les colonnes Tuteur n'étaient jamais remplies ; l'export Emploi du temps
 * n'était pas implémenté.
 */
import { apiClient } from "@/api/client";

export type ExportRow = Record<string, unknown>;

/** Plafond de sécurité : 100 pages de 100 lignes. */
const MAX_PAGES = 100;

type Page<T> = { items?: T[]; pages?: number; total?: number };

/** Toutes les pages d'une liste `page` / `page_size` (100 par page). */
export async function fetchAllPages<T>(url: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data } = await apiClient.get<Page<T>>(url, { params: { ...params, page, page_size: 100 } });
    const items = data?.items ?? [];
    all.push(...items);
    const pages = data?.pages ?? (data?.total !== undefined ? Math.ceil(data.total / 100) : 1);
    if (items.length < 100 || page >= pages) break;
  }
  return all;
}

const fullName = (first?: string | null, last?: string | null) => [first, last].filter(Boolean).join(" ");

interface StudentItem {
  id: string; registration_number?: string | null; first_name?: string | null; last_name?: string | null;
  date_of_birth?: string | null; gender?: string | null; class_name?: string | null;
  parent_name?: string | null; parent_phone?: string | null; parent_email?: string | null;
}

export async function exportStudents(classroomId: string | null, genderLabel: (g: string | null | undefined, fallback: string) => string): Promise<ExportRow[]> {
  let students = await fetchAllPages<StudentItem>("/students/");
  if (classroomId) {
    const { data: enrollments } = await apiClient.get<{ student_id: string }[]>("/enrollments/", {
      params: { class_id: classroomId, status: "ACTIVE" },
    });
    const inClass = new Set((Array.isArray(enrollments) ? enrollments : []).map((e) => String(e.student_id)));
    students = students.filter((s) => inClass.has(String(s.id)));
  }
  return students.map((s) => ({
    "N° Étudiant": s.registration_number ?? "",
    Prénom: s.first_name ?? "",
    Nom: s.last_name ?? "",
    "Date de naissance": s.date_of_birth ?? "",
    Genre: genderLabel(s.gender, ""),
    Classe: s.class_name ?? "",
    Tuteur: s.parent_name ?? "",
    "Tél. Tuteur": s.parent_phone ?? "",
    "Email Tuteur": s.parent_email ?? "",
  }));
}

interface UserItem { id: string; first_name?: string | null; last_name?: string | null; email?: string | null }
interface AssignmentItem { teacher_id: string; subject_name?: string | null; class_name?: string | null }

export async function exportTeachers(): Promise<ExportRow[]> {
  const [teachers, assignments] = await Promise.all([
    fetchAllPages<UserItem>("/users/", { role: "TEACHER" }),
    fetchAllPages<AssignmentItem>("/teachers/"),
  ]);
  const subjects = new Map<string, Set<string>>();
  const classes = new Map<string, Set<string>>();
  for (const a of assignments) {
    const id = String(a.teacher_id);
    if (a.subject_name) (subjects.get(id) ?? subjects.set(id, new Set()).get(id)!).add(a.subject_name);
    if (a.class_name) (classes.get(id) ?? classes.set(id, new Set()).get(id)!).add(a.class_name);
  }
  return teachers.map((u) => ({
    Prénom: u.first_name ?? "",
    Nom: u.last_name ?? "",
    Email: u.email ?? "",
    Matières: [...(subjects.get(String(u.id)) ?? [])].sort().join(", "),
    Classes: [...(classes.get(String(u.id)) ?? [])].sort().join(", "),
  }));
}

interface AssessmentItem {
  id: string; name?: string | null; class_id?: string | null; term_id?: string | null;
  subject_name?: string | null; term_name?: string | null; max_score?: number | null;
}
interface GradeItem { student_id: string; assessment_id: string; score?: number | null; max_score?: number | null; comments?: string | null }

export async function exportGrades(
  classroomId: string | null, termId: string | null, classroomNames: Map<string, string>,
): Promise<ExportRow[]> {
  const { data: assessmentPage } = await apiClient.get<{ items?: AssessmentItem[] } | AssessmentItem[]>("/assessments/", {
    params: { ...(classroomId ? { classId: classroomId } : {}), ...(termId ? { termId } : {}) },
  });
  const assessments = Array.isArray(assessmentPage) ? assessmentPage : assessmentPage?.items ?? [];
  const byId = new Map(assessments.map((a) => [String(a.id), a]));
  if (byId.size === 0) return [];
  const [grades, students] = await Promise.all([
    fetchAllPages<GradeItem>("/grades/", classroomId ? { class_id: classroomId } : {}),
    fetchAllPages<StudentItem>("/students/"),
  ]);
  const studentById = new Map(students.map((s) => [String(s.id), s]));
  return grades
    .filter((g) => byId.has(String(g.assessment_id)))
    .map((g) => {
      const a = byId.get(String(g.assessment_id))!;
      const s = studentById.get(String(g.student_id));
      return {
        "N° Étudiant": s?.registration_number ?? "",
        Étudiant: fullName(s?.first_name, s?.last_name),
        Classe: (a.class_id && classroomNames.get(String(a.class_id))) || "",
        Matière: a.subject_name ?? "",
        Évaluation: a.name ?? "",
        Trimestre: a.term_name ?? "",
        Note: g.score ?? "",
        "Note max": g.max_score ?? a.max_score ?? 20,
        Commentaire: g.comments ?? "",
      };
    });
}

interface AttendanceItem {
  date: string; status: string; reason?: string | null;
  student_name?: string | null; student_number?: string | null; classroom_name?: string | null;
}

const ATTENDANCE_LABELS: Record<string, string> = { PRESENT: "Présent", ABSENT: "Absent", LATE: "Retard", EXCUSED: "Excusé" };

export async function exportAttendance(classroomId: string | null): Promise<ExportRow[]> {
  const rows: AttendanceItem[] = [];
  for (let offset = 0; offset < 500 * MAX_PAGES; offset += 500) {
    const { data } = await apiClient.get<{ items?: AttendanceItem[] }>("/attendance/", {
      params: { ...(classroomId ? { classroom_id: classroomId } : {}), limit: 500, offset },
    });
    const items = data?.items ?? [];
    rows.push(...items);
    if (items.length < 500) break;
  }
  return rows.map((a) => ({
    Date: a.date,
    "N° Étudiant": a.student_number ?? "",
    Étudiant: a.student_name ?? "",
    Classe: a.classroom_name ?? "",
    Statut: ATTENDANCE_LABELS[a.status] ?? a.status,
    Remarques: a.reason ?? "",
  }));
}

interface InvoiceItem {
  invoice_number?: string | null; total_amount?: number | null; paid_amount?: number | null; status?: string | null;
  due_date?: string | null; created_at?: string | null;
  students?: { first_name?: string | null; last_name?: string | null; registration_number?: string | null } | null;
}

const INVOICE_LABELS: Record<string, string> = {
  PAID: "Payée", PARTIAL: "Partielle", OVERDUE: "En retard", PENDING: "En attente", CANCELLED: "Annulée",
};

export async function exportFinances(formatDate: (iso: string) => string): Promise<ExportRow[]> {
  const invoices = await fetchAllPages<InvoiceItem>("/payments/invoices/");
  return invoices.map((i) => {
    const total = Number(i.total_amount ?? 0);
    const paid = Number(i.paid_amount ?? 0);
    return {
      "N° Facture": i.invoice_number ?? "",
      "N° Étudiant": i.students?.registration_number ?? "",
      Étudiant: fullName(i.students?.first_name, i.students?.last_name),
      "Montant total": total,
      "Montant payé": paid,
      Solde: total - paid,
      Statut: INVOICE_LABELS[i.status ?? ""] ?? i.status ?? "",
      Échéance: i.due_date ?? "",
      "Date création": i.created_at ? formatDate(i.created_at) : "",
    };
  });
}

interface ScheduleItem {
  class_id?: string | null; day_of_week?: number | null; start_time?: string | null; end_time?: string | null;
  subject?: { name?: string | null } | null; room?: { name?: string | null } | null;
  teacher?: { first_name?: string | null; last_name?: string | null } | null;
}

/** Convention du module Emploi du temps : 1 = lundi … 7 = dimanche. */
const DAYS = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export async function exportSchedule(classroomId: string | null, classroomNames: Map<string, string>): Promise<ExportRow[]> {
  const { data } = await apiClient.get<ScheduleItem[]>("/schedule/", {
    params: classroomId ? { class_id: classroomId } : {},
  });
  return (Array.isArray(data) ? data : []).map((s) => ({
    Classe: (s.class_id && classroomNames.get(String(s.class_id))) || "",
    Jour: DAYS[Number(s.day_of_week)] ?? String(s.day_of_week ?? ""),
    "Heure début": s.start_time ?? "",
    "Heure fin": s.end_time ?? "",
    Matière: s.subject?.name ?? "",
    Enseignant: fullName(s.teacher?.first_name, s.teacher?.last_name),
    Salle: s.room?.name ?? "",
  }));
}
