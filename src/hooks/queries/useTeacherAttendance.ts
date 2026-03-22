import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export interface AttendanceRecord {
    id: string;
    student_id: string;
    class_id: string | null;
    date: string;
    status: AttendanceStatus;
    recorded_by: string | null;
    tenant_id: string;
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

export const useTeacherAttendance = (classroomId?: string, date?: string) => {
    const { user } = useAuth();
    const { tenant } = useTenant();
    const queryClient = useQueryClient();

    // 1. Fetch Students for a classroom
    const studentsQuery = useQuery({
        queryKey: ["classroom-students-attendance", classroomId],
        queryFn: async () => {
            if (!classroomId) return [];
            const { data, error } = await supabase
                .from("enrollments")
                .select(`
          student_id,
          students (id, first_name, last_name, registration_number)
        `)
                .eq("class_id", classroomId)
                .eq("status", "active");
            if (error) throw error;
            return data;
        },
        enabled: !!classroomId,
    });

    // 2. Fetch Attendance records
    const attendanceQuery = useQuery({
        queryKey: ["attendance-records", classroomId, date],
        queryFn: async () => {
            if (!classroomId || !date) return [];
            const { data, error } = await supabase
                .from("attendance")
                .select("*")
                .eq("class_id", classroomId)
                .eq("date", date);
            if (error) throw error;
            return data as AttendanceRecord[];
        },
        enabled: !!classroomId && !!date,
    });

    // 3. Save/Update Attendance Mutation
    const saveAttendance = useMutation({
        mutationFn: async ({
            studentId,
            status,
        }: {
            studentId: string;
            status: AttendanceStatus;
        }) => {
            if (!tenant?.id) throw new Error("Tenant missing");

            const existingRecord = attendanceQuery.data?.find(a => a.student_id === studentId);

            if (existingRecord) {
                const { error } = await supabase
                    .from("attendance")
                    .update({ status })
                    .eq("id", existingRecord.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from("attendance")
                    .insert({
                        student_id: studentId,
                        class_id: classroomId,
                        date: date,
                        status,
                        tenant_id: tenant.id,
                        recorded_by: user?.id,
                    });
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["attendance-records", classroomId, date] });
            toast.success("Présence enregistrée");
        },
        onError: (error: any) => {
            toast.error("Erreur lors de l'enregistrement: " + error.message);
        }
    });

    return {
        students: studentsQuery.data || [],
        attendance: attendanceQuery.data || [],
        isLoading: studentsQuery.isLoading || attendanceQuery.isLoading,
        saveAttendance: saveAttendance.mutateAsync,
        isSaving: saveAttendance.isPending,
    };
};

export const useClassSessions = (classroomId?: string, subjectId?: string) => {
    const { tenant } = useTenant();
    const queryClient = useQueryClient();

    const activeSessionQuery = useQuery({
        queryKey: ['active-session', classroomId, subjectId],
        queryFn: async () => {
            if (!classroomId || !subjectId || !tenant?.id) return null;
            const today = new Date().toISOString().split('T')[0];
            const { data, error } = await supabase
                .from('class_sessions')
                .select('*, subjects(name), classrooms(name)')
                .eq('tenant_id', tenant.id)
                .eq('class_id', classroomId)
                .eq('subject_id', subjectId)
                .eq('session_date', today)
                .eq('status', 'active')
                .maybeSingle();
            if (error) throw error;
            return data;
        },
        enabled: !!classroomId && !!subjectId && !!tenant?.id,
    });

    return {
        activeSession: activeSessionQuery.data,
        isLoading: activeSessionQuery.isLoading,
        refetchSession: activeSessionQuery.refetch,
    };
};
