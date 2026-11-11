/**
 * Rendez-vous parents-enseignants : contrat de l'API (2026-11-11).
 * Serveur : backend/app/services/appointments.py.
 */

export type AppointmentStatus = "REQUESTED" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";

export interface PersonRef {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

export interface AppointmentSlot {
  id: string;
  teacher_id: string | null;
  teacher: PersonRef | null;
  date: string; // AAAA-MM-JJ
  start_time: string; // HH:MM:SS
  end_time: string;
  max_appointments: number;
  booked_count: number;
  is_available: boolean;
  location: string | null;
}

export interface Appointment {
  id: string;
  status: AppointmentStatus;
  appointment_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  slot_id: string | null;
  notes: string | null;
  teacher: PersonRef | null;
  parent: PersonRef | null;
  student: PersonRef | null;
}

/** Rendez-vous qui occupent encore leur créneau. */
export const ACTIVE_STATUSES: AppointmentStatus[] = ["REQUESTED", "CONFIRMED"];

/** Clé i18n du libellé de chaque statut. */
export const STATUS_LABEL_KEYS: Record<AppointmentStatus, string> = {
  REQUESTED: "appointments.statusScheduled",
  CONFIRMED: "appointments.statusConfirmed",
  CANCELLED: "appointments.statusCancelled",
  COMPLETED: "appointments.statusCompleted",
  NO_SHOW: "appointments.statusAbsent",
};

/** Le lieu d'un créneau en ligne est le lien de visioconférence. */
export function isOnlineLocation(location: string | null | undefined): boolean {
  return !!location && /^https?:\/\//i.test(location.trim());
}

/** « 16:00:00 » → « 16:00 » ; tolère une heure absente. */
export function hhmm(time: string | null | undefined): string {
  return time ? time.slice(0, 5) : "";
}

export function fullName(person: PersonRef | null | undefined): string {
  return [person?.first_name, person?.last_name].filter(Boolean).join(" ");
}
