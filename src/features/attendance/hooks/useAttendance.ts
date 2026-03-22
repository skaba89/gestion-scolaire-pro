/**
 * useAttendance Hook
 * Centralized hook for Attendance management
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenantStore } from "@/stores/tenantStore";
import { attendanceService } from "../services/attendanceService";
import { supabase } from "@/integrations/supabase/client";
import type { AttendanceFormData, AttendanceFilters, AttendanceRecord } from "../types/attendance";
import { toast } from "sonner";
import { useAuditLog } from "@/hooks/useAuditLog";

export const useAttendance = (filters?: AttendanceFilters & { classId?: string; date?: string; subjectId?: string }) => {
  const currentTenant = useTenantStore((state) => state.currentTenant);
  const queryClient = useQueryClient();
  const { logCreate, logUpdate, logDelete } = useAuditLog();

  // Query Key Construction
  const attendanceQueryKey = ["attendance", currentTenant?.id, filters];

  // ----------------------------------------------------------------------
  // Queries
  // ----------------------------------------------------------------------

  // List Attendance (General or Class specific)
  const attendanceQuery = useQuery({
    queryKey: attendanceQueryKey,
    queryFn: async () => {
      if (!currentTenant?.id) return [];

      // If classId and date are provided, use specific method (Teacher View optimization)
      if (filters?.classId && filters?.date) {
        return attendanceService.getClassroomAttendance(filters.classId, filters.date);
      }

      return attendanceService.listAttendance(currentTenant.id, filters);
    },
    enabled: !!currentTenant?.id,
  });

  // Active Class Session (Teacher Dashboard)
  const activeSessionQuery = useQuery({
    queryKey: ['active-session', filters?.classId, filters?.subjectId],
    queryFn: async () => {
      if (!filters?.classId || !filters?.subjectId || !currentTenant?.id) return null;
      return attendanceService.getActiveClassSession(currentTenant.id, filters.classId, filters.subjectId);
    },
    enabled: !!filters?.classId && !!filters?.subjectId && !!currentTenant?.id,
  });

  // Fetch Students for a classroom (Teacher Attendance View)
  const studentsQuery = useQuery({
    queryKey: ["classroom-students-attendance", filters?.classId],
    queryFn: async () => {
      if (!filters?.classId) return [];
      // This technically belongs to studentService, but for performance in this hook:
      const { data, error } = await supabase
        .from("enrollments")
        .select(`
          student_id,
          students (id, first_name, last_name, registration_number)
        `)
        .eq("class_id", filters.classId)
        .eq("status", "active");
      if (error) throw error;
      return data;
    },
    enabled: !!filters?.classId,
  });

  // ----------------------------------------------------------------------
  // Mutations
  // ----------------------------------------------------------------------

  const createAttendanceMutation = useMutation({
    mutationFn: (data: AttendanceFormData) => {
      if (!currentTenant?.id) throw new Error("No tenant selected");
      return attendanceService.createAttendance(currentTenant.id, data);
    },
    onSuccess: (newRecord) => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      logCreate("attendance", newRecord.id, newRecord);
      toast.success("Présence enregistrée");
    },
    onError: (error: Error) => toast.error(`Erreur: ${error.message}`),
  });

  const updateAttendanceMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AttendanceFormData> }) =>
      attendanceService.updateAttendance(id, data),
    onSuccess: (updatedRecord) => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      logUpdate("attendance", updatedRecord.id, {}, updatedRecord);
      toast.success("Présence mise à jour");
    },
    onError: (error: Error) => toast.error(`Erreur: ${error.message}`),
  });

  const upsertAttendanceMutation = useMutation({
    mutationFn: (data: AttendanceFormData) => {
      if (!currentTenant?.id) throw new Error("No tenant selected");
      return attendanceService.upsertAttendance(currentTenant.id, data);
    },
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      // Upsert is often rapid-fire in teacher view, maybe skip toast or use "sonner" discreetly
      // toast.success("Enregistré"); 
    },
    onError: (error: Error) => toast.error(`Erreur: ${error.message}`),
  });

  const deleteAttendanceMutation = useMutation({
    mutationFn: ({ id, recordData }: { id: string; recordData?: AttendanceRecord }) => {
      if (recordData) logDelete("attendance", id, recordData);
      return attendanceService.deleteAttendance(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success("Présence supprimée");
    },
    onError: (error: Error) => toast.error(`Erreur: ${error.message}`),
  });

  return {
    // Data
    attendance: attendanceQuery.data || [],
    attendanceList: attendanceQuery.data || [], // Alias
    students: studentsQuery.data || [],
    activeSession: activeSessionQuery.data,

    // Loading States
    isLoading: attendanceQuery.isLoading || activeSessionQuery.isLoading || studentsQuery.isLoading,
    error: attendanceQuery.error || activeSessionQuery.error || studentsQuery.error,

    // Actions
    create: createAttendanceMutation.mutate,
    update: updateAttendanceMutation.mutate,
    upsert: upsertAttendanceMutation.mutate,
    delete: deleteAttendanceMutation.mutate,

    // Mutation States
    isCreating: createAttendanceMutation.isPending,
    isUpdating: updateAttendanceMutation.isPending,
    isUpserting: upsertAttendanceMutation.isPending,
    isDeleting: deleteAttendanceMutation.isPending,
  };
};
