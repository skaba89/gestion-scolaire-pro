import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { staffService } from "../services/staffService";
import type { StaffFilters, StaffFormData, StaffRole } from "../types";
import { toast } from "sonner";
import { useAuditLog } from "@/hooks/useAuditLog";
import { useAuth } from "@/contexts/AuthContext";

export const useStaff = (filters?: StaffFilters & { page?: number; pageSize?: number }) => {
    const { currentTenant } = useTenant();
    const queryClient = useQueryClient();
    const { logCreate, logUpdate, logDelete } = useAuditLog();

    // ----------------------------------------------------------------------
    // Queries
    // ----------------------------------------------------------------------

    const staffQuery = useQuery({
        queryKey: ["staff", currentTenant?.id, filters],
        queryFn: async () => {
            if (!currentTenant?.id) return { data: [], totalCount: 0 };
            return staffService.listStaff(currentTenant.id, filters);
        },
        enabled: !!currentTenant?.id,
    });

    // ----------------------------------------------------------------------
    // Mutations
    // ----------------------------------------------------------------------

    const addStaffMutation = useMutation({
        mutationFn: (data: StaffFormData) => {
            if (!currentTenant?.id) throw new Error("No tenant selected");
            return staffService.addStaff(currentTenant.id, data);
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["staff"] });
            queryClient.invalidateQueries({ queryKey: ["teachers"] }); // Invalidate legacy teachers query
            // We don't have the new user ID easily here unless we change return of addStaff, 
            // but let's assume we log based on email or something, or skip detailed log for now.
            // logCreate("staff", "unknown", variables); 
            toast.success("Membre du personnel ajouté avec succès");
        },
        onError: (error: Error) => toast.error(`Erreur: ${error.message}`),
    });

    const removeStaffRoleMutation = useMutation({
        mutationFn: ({ userId, role }: { userId: string; role: StaffRole }) => {
            if (!currentTenant?.id) throw new Error("No tenant selected");
            return staffService.removeStaffRole(currentTenant.id, userId, role);
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["staff"] });
            queryClient.invalidateQueries({ queryKey: ["teachers"] });
            logDelete("staff_role", variables.userId, { role: variables.role });
            toast.success("Rôle retiré avec succès");
        },
        onError: (error: Error) => toast.error(`Erreur: ${error.message}`),
    });

    return {
        // Data
        staff: staffQuery.data?.data || [],
        totalCount: staffQuery.data?.totalCount || 0,
        isLoading: staffQuery.isLoading,
        error: staffQuery.error,

        // Actions
        addStaff: addStaffMutation.mutateAsync,
        removeStaffRole: removeStaffRoleMutation.mutateAsync,

        // Loading States
        isAdding: addStaffMutation.isPending,
        isRemoving: removeStaffRoleMutation.isPending,
    };
};

import { apiClient } from "@/api/client";

export const useTeacherData = (teacherId?: string) => {
    const { user } = useAuth();
    const { currentTenant } = useTenant();
    const targetId = teacherId || user?.id;

    const dashboardQuery = useQuery({
        queryKey: ["teacher-dashboard", currentTenant?.id, targetId],
        queryFn: async () => {
            if (!currentTenant?.id || !targetId) return null;
            // Note: If targetId != current_user, might need to pass it as query param, 
            // but usually this is used for the logged-in teacher.
            const { data } = await apiClient.get('/teachers/dashboard', {
                params: { teacher_id: targetId }
            });
            return data;
        },
        enabled: !!currentTenant?.id && !!targetId,
    });

    const data = dashboardQuery.data || {
        assignments: [],
        schedule: [],
        assessments: []
    };

    const assignments = data.assignments || [];

    const assignedClassrooms = assignments.reduce((acc: any[], curr: any) => {
        if (curr.classrooms && !acc.find((c: any) => c.id === curr.class_id)) {
            acc.push(curr.classrooms);
        }
        return acc;
    }, []);

    const assignedSubjects = assignments.reduce((acc: any[], curr: any) => {
        if (curr.subjects && !acc.find((s: any) => s.id === curr.subject_id)) {
            acc.push(curr.subjects);
        }
        return acc;
    }, []);

    const getSubjectsForClassroom = (classroomId: string) => {
        return assignments
            .filter((a: any) => a.class_id === classroomId)
            .map((a: any) => a.subjects);
    };

    return {
        assignments,
        assignedClassrooms,
        assignedSubjects,
        getSubjectsForClassroom,
        // Optional assessments return for unified data
        assessments: data.assessments || [],
        schedule: (data.schedule || []).map((slot: any) => ({
            ...slot,
            day_of_week: typeof slot.day_of_week === 'string' ? parseInt(slot.day_of_week) : slot.day_of_week
        })),
        isLoading: dashboardQuery.isLoading,
        isScheduleLoading: dashboardQuery.isLoading,
        isAssignmentsLoading: dashboardQuery.isLoading,
        hasAssignments: assignments.length > 0,
    };
};

// Backward compatibility alias
export const useTeacherSchedule = useTeacherData;
