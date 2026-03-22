/**
 * Attendance Service
 * Centralized service for Student Attendance and Life School
 */

import { supabase } from "@/integrations/supabase/client";
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
    let query = supabase
      .from("attendance")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("date", { ascending: false });

    if (filters?.studentId) {
      query = query.eq("student_id", filters.studentId);
    }

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    if (filters?.startDate && filters?.endDate) {
      query = query.gte("date", filters.startDate).lte("date", filters.endDate);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch attendance: ${error.message}`);
    return (data || []) as unknown as AttendanceRecord[];
  },

  async getStudentAttendance(studentId: string, startDate?: string, endDate?: string) {
    let query = supabase
      .from("attendance")
      .select("*")
      .eq("student_id", studentId)
      .order("date", { ascending: false });

    if (startDate && endDate) {
      query = query.gte("date", startDate).lte("date", endDate);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch student attendance: ${error.message}`);

    const records = (data || []) as unknown as AttendanceRecord[];
    return {
      records,
      stats: calculateAttendanceStats(records),
    };
  },

  async createAttendance(tenantId: string, data: AttendanceFormData) {
    const { data: result, error } = await supabase
      .from("attendance")
      .insert({ ...data, tenant_id: tenantId })
      .select()
      .single();

    if (error) throw new Error(`Failed to create attendance: ${error.message}`);
    return result as unknown as AttendanceRecord;
  },

  async updateAttendance(id: string, data: Partial<AttendanceFormData>) {
    const { data: result, error } = await supabase
      .from("attendance")
      .update(data)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update attendance: ${error.message}`);
    return result as unknown as AttendanceRecord;
  },

  async deleteAttendance(id: string) {
    const { error } = await supabase
      .from("attendance")
      .delete()
      .eq("id", id);

    if (error) throw new Error(`Failed to delete attendance: ${error.message}`);
  },

  // ----------------------------------------------------------------------
  // Advanced & Teacher Operations
  // ----------------------------------------------------------------------

  /**
   * Upsert attendance record (Create or Update based on student + date + class)
   * Used by Teacher View for quick toggling
   */
  async upsertAttendance(tenantId: string, data: AttendanceFormData) {
    // Check for existing record
    let query = supabase
      .from("attendance")
      .select("id")
      .eq("student_id", data.student_id)
      .eq("date", data.date);

    // If class_id is provided, include it in the check
    if (data.class_id) {
      query = query.eq("class_id", data.class_id);
    } else {
      // If no class_id, check for records with null class_id (daily attendance)
      query = query.is("class_id", null);
    }

    const { data: existing, error: fetchError } = await query.maybeSingle();

    if (fetchError) throw new Error(`Failed to check existing attendance: ${fetchError.message}`);

    if (existing) {
      return this.updateAttendance(existing.id, { status: data.status, reason: data.reason });
    } else {
      return this.createAttendance(tenantId, data);
    }
  },

  async bulkCreateAttendance(tenantId: string, records: AttendanceFormData[]) {
    // Prepare records
    const recordsToInsert = records.map(r => ({
      ...r,
      tenant_id: tenantId,
    }));

    const { data, error } = await supabase
      .from("attendance")
      .insert(recordsToInsert)
      .select();

    if (error) throw new Error(`Failed to bulk create attendance: ${error.message}`);
    return (data || []) as unknown as AttendanceRecord[];
  },

  async getClassroomAttendance(classroomId: string, date: string) {
    const { data, error } = await supabase
      .from("attendance")
      .select("*")
      .eq("class_id", classroomId)
      .eq("date", date);

    if (error) throw new Error(`Failed to fetch classroom attendance: ${error.message}`);
    return (data || []) as unknown as AttendanceRecord[];
  },

  /**
   * Get active class session for digital signage or teacher dashboard
   */
  async getActiveClassSession(tenantId: string, classroomId: string, subjectId: string) {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('class_sessions')
      .select('*, subjects(name), classrooms(name)')
      .eq('tenant_id', tenantId)
      .eq('class_id', classroomId)
      .eq('subject_id', subjectId)
      .eq('session_date', today)
      .eq('status', 'active')
      .maybeSingle();

    if (error) throw error;
    return data;
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
