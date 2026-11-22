export interface IncidentPerson {
  first_name?: string | null;
  last_name?: string | null;
}

export interface IncidentRecord {
  id: string;
  incident_number?: string | null;
  incident_type: string;
  severity: string;
  title: string;
  parties?: unknown[];
  resolver?: IncidentPerson | null;
  location?: string | null;
  occurred_at: string;
  status: string;
}

export interface IncidentFormData {
  incident_type: string;
  severity: string;
  title: string;
  description: string;
  location: string;
  occurred_at: string;
  student_ids: string[];
}

export function normalizeIncidentStatus(status: unknown): string {
  return String(status ?? "open").toLowerCase();
}
