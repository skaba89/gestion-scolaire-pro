/**
 * Réinscription d'un enfant par son parent connecté (page
 * `/parent/pre-registration`).
 *
 * Défauts corrigés (audit 2026-11-03, API-01) : la page appelait trois routes
 * publiques inexistantes (parcours bloqué) et, `GET /academic-years/`
 * renvoyant les années de la plus récente à la plus ancienne, « l'année
 * suivante » calculée par position était en réalité l'année PRÉCÉDENTE.
 */
import { apiClient } from "@/api/client";

export interface AcademicYearLite {
  id: string;
  name: string;
  start_date: string;
  is_current?: boolean;
}

export interface Reenrollment {
  id: string;
  student_id: string;
  academic_year_id: string | null;
  level_id: string | null;
  level_name: string | null;
  status: string;
  status_label: string;
  submitted_at: string | null;
}

/**
 * Année pour laquelle on réinscrit : celle qui suit l'année en cours (par date
 * de début) ; sans année en cours, la première qui commence après `today`.
 * Aucune année future configurée → null (la page l'indique, sans inventer).
 */
export function nextAcademicYear<T extends AcademicYearLite>(years: T[], today: Date = new Date()): T | null {
  const sorted = [...years].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const current = sorted.find((y) => y.is_current);
  if (current) {
    return sorted.find((y) => y.start_date > current.start_date) ?? null;
  }
  const iso = today.toISOString().slice(0, 10);
  return sorted.find((y) => y.start_date > iso) ?? null;
}

/** Demandes des enfants du parent connecté, indexées par élève (la plus récente). */
export async function fetchMyReenrollments(academicYearId: string): Promise<Record<string, Reenrollment>> {
  const { data } = await apiClient.get<Reenrollment[]>("/admissions/reenrollments/mine/", {
    params: { academic_year_id: academicYearId },
  });
  const byStudent: Record<string, Reenrollment> = {};
  for (const r of data ?? []) {
    if (!byStudent[r.student_id]) byStudent[r.student_id] = r; // trié du plus récent au plus ancien
  }
  return byStudent;
}

/** Le serveur vérifie que l'enfant est bien celui du parent ; les coordonnées viennent du compte. */
export async function submitReenrollment(input: {
  studentId: string;
  academicYearId: string;
  levelId?: string | null;
  notes?: string;
}): Promise<Reenrollment> {
  const { data } = await apiClient.post<Reenrollment>("/admissions/reenrollments/", {
    student_id: input.studentId,
    academic_year_id: input.academicYearId,
    level_id: input.levelId || null,
    notes: input.notes?.trim() || null,
  });
  return data;
}
