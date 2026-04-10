/**
 * Attendance Service
 * Centralized service for Student Attendance and Life School
 */

import { apiClient } from "@/api/client";
import type { AttendanceRecord, AttendanceFormData, AttendanceFilters, AttendanceStats } from "../types/attendance";

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
    return (data || []) as unknown as AttendanceRecord[];
  },

  async getStudentAttendance(studentId: string, startDate?: string, endDate?: string) {
    const params: any = { student_id: studentId };

    if (startDate && endDate) {
      params.start_date = startDate;
      params.end_date = endDate;
    }

    const { data } = await apiClient.get("/attendance/", { params });
    const records = (data || []) as unknown as AttendanceRecord[];
    return {
      records,
      stats: calculateAttendanceStats(records),
    };
  },

  async createAttendance(tenantId: string, data: AttendanceFormData) {
    const { data: result } = await apiClient.post("/attendance/", {
      ...data,
      tenant_id: tenantId,
    });
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
  async upsertAttendance(tenantId: string, data: AttendanceFormData) {
    const { data: result } = await apiClient.post("/attendance/upsert/", {
      ...data,
      tenant_id: tenantId,
    });
    return result as unknown as AttendanceRecord;
  },

  async bulkCreateAttendance(tenantId: string, records: AttendanceFormData[]) {
    const { data } = await apiClient.post("/attendance/bulk/", {
      records: records.map(r => ({ ...r, tenant_id: tenantId })),
    });
    return (data || []) as unknown as AttendanceRecord[];
  },

  async getClassroomAttendance(classroomId: string, date: string) {
    const { data } = await apiClient.get("/attendance/", {
      params: { class_id: classroomId, date },
    });
    return (data || []) as unknown as AttendanceRecord[];
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
