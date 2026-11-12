import { apiClient } from "@/api/client";

/**
 * Structure académique lue sur les VRAIES routes de l'API (2026-11-12,
 * AUD-ROUTES). Les pages Certificats, Listes de classe et Statistiques
 * d'inscription appelaient /students/classes/, /students/academic-years/,
 * /admissions/enrollments/… : routes inexistantes que le serveur prenait pour
 * /students/{id}/ ou /admissions/{id}/ (422/404) — pages vides ou plantées.
 */

export interface NamedRef { id: string; name: string }

export interface ClassroomWithRefs {
  id: string;
  name: string;
  capacity: number | null;
  level_id: string | null;
  campus_id: string | null;
  academic_year_id: string | null;
  level: NamedRef | null;
  campus: NamedRef | null;
}

export interface AcademicYearRef {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface EnrollmentRow {
  id: string;
  student_id: string;
  class_id: string;
  academic_year_id: string;
  status: string;
  student: { id: string; first_name: string; last_name: string; registration_number: string | null } | null;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "fr");

/** Classes de l'établissement, avec le nom de leur niveau et de leur campus. */
export async function fetchClassroomsWithRefs(): Promise<ClassroomWithRefs[]> {
  const [classrooms, levels, campuses] = await Promise.all([
    apiClient.get<any[]>("/infrastructure/classrooms/"),
    apiClient.get<NamedRef[]>("/levels/"),
    apiClient.get<NamedRef[]>("/campuses/"),
  ]);
  const levelById = new Map((levels.data || []).map((l) => [l.id, l]));
  const campusById = new Map((campuses.data || []).map((c) => [c.id, c]));
  return (classrooms.data || [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      capacity: c.capacity ?? null,
      level_id: c.level_id ?? null,
      campus_id: c.campus_id ?? null,
      academic_year_id: c.academic_year_id ?? null,
      level: c.level_id ? levelById.get(c.level_id) ?? null : null,
      campus: c.campus_id ? campusById.get(c.campus_id) ?? null : null,
    }))
    .sort(byName);
}

/** Années académiques, la plus récente d'abord. */
export async function fetchAcademicYears(): Promise<AcademicYearRef[]> {
  const { data } = await apiClient.get<AcademicYearRef[]>("/academic-years/");
  return [...(data || [])].sort((a, b) => (b.start_date || "").localeCompare(a.start_date || ""));
}

/** Année en cours (marquée `is_current`), sinon la plus récente. */
export async function fetchCurrentAcademicYear(): Promise<AcademicYearRef | null> {
  const years = await fetchAcademicYears();
  return years.find((y) => y.is_current) ?? years[0] ?? null;
}

/** Inscriptions filtrées côté serveur ; `classIds` est découpé par lots de 100 (limite de l'API). */
export async function fetchEnrollments(filters: {
  classId?: string;
  classIds?: string[];
  academicYearId?: string;
  status?: string;
}): Promise<EnrollmentRow[]> {
  const base: Record<string, string> = {};
  if (filters.classId) base.class_id = filters.classId;
  if (filters.academicYearId) base.academic_year_id = filters.academicYearId;
  if (filters.status) base.status = filters.status;
  if (!filters.classIds) {
    const { data } = await apiClient.get<EnrollmentRow[]>("/enrollments/", { params: base });
    return data || [];
  }
  const out: EnrollmentRow[] = [];
  for (let i = 0; i < filters.classIds.length; i += 100) {
    const chunk = filters.classIds.slice(i, i + 100);
    const { data } = await apiClient.get<EnrollmentRow[]>("/enrollments/", {
      params: { ...base, class_ids: chunk.join(",") },
    });
    out.push(...(data || []));
  }
  return out;
}
