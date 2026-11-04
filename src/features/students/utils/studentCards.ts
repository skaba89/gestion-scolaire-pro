/**
 * Cartes QR des élèves — un seul code : `students.card_uid`, celui que lisent
 * la borne de pointage et le scanner enseignant (2026-11-04, BADGE-01).
 *
 * Avant : la page « Badges » et l'impression par lot fabriquaient leur propre
 * code (JSON) et l'envoyaient à des routes inexistantes ou à une route qui
 * le jetait : aucune carte imprimée n'était reconnue au pointage.
 */
import { apiClient } from "@/api/client";

export interface StudentCard {
  student_id: string;
  first_name: string;
  last_name: string;
  registration_number: string | null;
  photo_url?: string | null;
  card_uid: string | null;
}

/** Forme attendue par les composants d'affichage existants (tableau, détail, impression). */
export interface CardBadge {
  id: string;
  student_id: string;
  badge_code: string;
  /** Contenu du QR : le code brut, tel que la borne et le scanner le lisent. */
  qr_code_data: string;
  status: "ACTIVE";
  student: { id: string; first_name: string; last_name: string; registration_number: string | null; photo_url?: string | null };
}

// Adresses littérales : le contrôle CI (scripts/audit/frontend-api-routes.mjs) les vérifie.

export async function listStudentCards(classroomId?: string): Promise<StudentCard[]> {
  const { data } = await apiClient.get<StudentCard[]>("/school-life/student-cards/", {
    params: classroomId ? { classroom_id: classroomId } : undefined,
  });
  return data ?? [];
}

/** Attribue un code aux élèves qui n'en ont pas ; `reissue` : nouveau code, l'ancienne carte ne marche plus. */
export async function issueStudentCards(studentIds: string[], reissue = false): Promise<StudentCard[]> {
  const { data } = await apiClient.post<{ changed: number; cards: StudentCard[] }>("/school-life/student-cards/issue/", {
    student_ids: studentIds,
    reissue,
  });
  return data.cards;
}

export async function revokeStudentCard(studentId: string): Promise<void> {
  await apiClient.delete(`/school-life/student-cards/${studentId}/`);
}

export function cardToBadge(c: StudentCard): CardBadge | null {
  if (!c.card_uid) return null;
  return {
    id: c.student_id,
    student_id: c.student_id,
    badge_code: c.card_uid,
    qr_code_data: c.card_uid,
    status: "ACTIVE",
    student: { id: c.student_id, first_name: c.first_name, last_name: c.last_name,
               registration_number: c.registration_number, photo_url: c.photo_url },
  };
}

/** Élève correspondant à un QR scanné — même résolution que le scanner enseignant. */
export async function resolveScannedCard(raw: string): Promise<{ student_id: string; first_name: string; last_name: string } | null> {
  const { data } = await apiClient.get("/school-life/check-ins/badges/", { params: { qr_code_data: raw.trim() } });
  return data ?? null;
}
