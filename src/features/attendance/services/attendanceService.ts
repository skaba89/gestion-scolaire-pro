/**
 * Attendance Service
 * Centralized service for Student Attendance and Life School
 */

import { apiClient } from "@/api/client";
import type { AttendanceRecord, AttendanceFormData, AttendanceFilters, AttendanceStats } from "../types/attendance";
import { toList } from "@/lib/api-list";


/**
 * Format attendu par l'API (AttendanceCreate) : `classroom_id` et `reason`.
 * Les écrans envoyaient `class_id` et `notes`, ignorés par l'API — la
 * présence était enregistrée sans classe, donc hors du périmètre enseignant.
 */
function toApiRecord(data: AttendanceFormData) {
  return {
    student_id: data.student_id,
    date: data.date,
    status: data.status,
    reason: data.notes ?? undefined,
    classroom_id: data.class_id ?? undefined,
  };
}

export interface SessionCheckIn {
  id: string;
  student_id: string;
  checked_at: string;
  students?: {
    id: string;
    first_name: string;
    last_name: string;
    registration_number: string | null;
  };
}

export const attendanceService = {
  // ----------------------------------------------------------------------
  // Basic Operations
  // ----------------------------------------------------------------------

  async listAttendance(tenantId: string, filters?: AttendanceFilters) {
    const params: any = { tenant_id: tenantId };

    if (filters?.studentId) {
      params.student_id = filters.studentId;
    }

    if (filters?.status) {
      params.status = filters.status;
    }

    if (filters?.startDate && filters?.endDate) {
      params.start_date = filters.startDate;
      params.end_date = filters.endDate;
    }

    const { data } = await apiClient.get("/attendance/", { params });
    return (data?.items ?? data ?? []) as unknown as AttendanceRecord[];
  },

  async getStudentAttendance(studentId: string, startDate?: string, endDate?: string) {
    const params: any = { student_id: studentId };

    if (startDate && endDate) {
      params.date_from = startDate;
      params.date_to = endDate;
    }

    const { data } = await apiClient.get("/attendance/", { params });
    const records = (data?.items ?? data ?? []) as unknown as AttendanceRecord[];
    return {
      records,
      stats: calculateAttendanceStats(records),
    };
  },

  async createAttendance(_tenantId: string, data: AttendanceFormData) {
    const { data: result } = await apiClient.post("/attendance/", toApiRecord(data));
    return result as unknown as AttendanceRecord;
  },

  async updateAttendance(id: string, data: Partial<AttendanceFormData>) {
    const { data: result } = await apiClient.patch(`/attendance/${id}/`, data);
    return result as unknown as AttendanceRecord;
  },

  async deleteAttendance(id: string) {
    await apiClient.delete(`/attendance/${id}/`);
  },

  // ----------------------------------------------------------------------
  // Advanced & Teacher Operations
  // ----------------------------------------------------------------------

  /**
   * Upsert attendance record (Create or Update based on student + date + class)
   * Used by Teacher View for quick toggling
   */
  async upsertAttendance(_tenantId: string, data: AttendanceFormData) {
    // Il n'existe pas de route /attendance/upsert/ (l'API répondait 405 :
    // le pointage enseignant échouait à chaque clic). Mise à jour de la
    // présence existante de l'étudiant pour ce jour et cette classe, sinon
    // création — deux routes existantes, soumises au périmètre enseignant.
    const record = toApiRecord(data);
    const { data: found } = await apiClient.get("/attendance/", {
      params: {
        student_id: record.student_id,
        classroom_id: record.classroom_id,
        date_from: record.date,
        date_to: record.date,
      },
    });
    const existing = toList<AttendanceRecord>(found).find(
      (a) => a.student_id === record.student_id && String(a.date).slice(0, 10) === record.date,
    );
    if (existing) {
      const { data: updated } = await apiClient.patch(`/attendance/${existing.id}/`, {
        status: record.status,
        reason: record.reason,
      });
      return updated as unknown as AttendanceRecord;
    }
    const { data: created } = await apiClient.post("/attendance/", record);
    return created as unknown as AttendanceRecord;
  },

  async bulkCreateAttendance(_tenantId: string, records: AttendanceFormData[]) {
    const { data } = await apiClient.post("/attendance/bulk/", {
      records: records.map(toApiRecord),
    });
    return (data || []) as unknown as AttendanceRecord[];
  },

  async getClassroomAttendance(classroomId: string, date: string) {
    const { data } = await apiClient.get("/attendance/", {
      params: { classroom_id: classroomId, date_from: date, date_to: date },
    });
    return (data?.items ?? data ?? []) as unknown as AttendanceRecord[];
  },

  /**
   * Get active class session for digital signage or teacher dashboard
   */
  async getActiveClassSession(tenantId: string, classroomId: string, subjectId: string) {
    const { data } = await apiClient.get("/class-sessions/active/", {
      params: {
        tenant_id: tenantId,
        class_id: classroomId,
        subject_id: subjectId,
      },
    });
    return data || null;
  }
};

/**
 * Helper function to calculate attendance statistics
 */
function calculateAttendanceStats(records: AttendanceRecord[]): AttendanceStats {
  const statuses = records.map(r => r.status);

  return {
    totalDays: records.length,
    presentDays: statuses.filter(s => s === "PRESENT").length,
    absentDays: statuses.filter(s => s === "ABSENT").length,
    lateDays: statuses.filter(s => s === "LATE").length,
    excusedDays: statuses.filter(s => s === "EXCUSED").length,
    attendancePercentage: records.length > 0
      ? ((statuses.filter(s => s === "PRESENT" || s === "LATE").length / records.length) * 100)
      : 0,
  };
}
