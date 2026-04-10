import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";

export interface TeacherAssignment {
    id: string;
    class_id: string;
    subject_id: string;
    classroom: {
        id: string;
        name: string;
    };
    subject: {
        id: string;
        name: string;
    };
}

export interface TeacherScheduleSlot {
    id: string;
    class_id: string;
    subject_id: string;
    teacher_id: string | null;
    day_of_week: number;
    start_time: string;
    end_time: string;
    room_id: string | null;
    subject: { id: string; name: string } | null;
    room: { id: string; name: string } | null;
    classroom: { id: string; name: string } | null;
}

export const useTeacherData = () => {
    const { user } = useAuth();
    const { tenant } = useTenant();

    // 1. Fetch Assignments
    const assignmentsQuery = useQuery({
        queryKey: ["teacher-assignments", user?.id, tenant?.id],
        queryFn: async () => {
            if (!user?.id || !tenant?.id) return [];

            const { data } = await apiClient.get<TeacherAssignment[]>("/teachers/dashboard/", {
                params: { include_assignments: true },
            });

            return (data ?? []).map(a => ({
                id: a.id,
                class_id: a.class_id,
                subject_id: a.subject_id,
                classroom: a.classroom,
                subject: a.subject,
            })) as TeacherAssignment[];
        },
        enabled: !!user?.id && !!tenant?.id,
    });

    // 2. Fetch Schedule
    const scheduleQuery = useQuery({
        queryKey: ["teacher-schedule-data", user?.id, tenant?.id],
        queryFn: async () => {
            if (!user?.id || !tenant?.id) return [];

            const { data } = await apiClient.get<TeacherScheduleSlot[]>("/teachers/dashboard/", {
                params: { include_schedule: true },
            });

            return (data ?? []).map((slot: any) => ({
                ...slot,
                subject: slot.subject || slot.subject_data || null,
                room: slot.room || slot.room_data || null,
                classroom: slot.classroom || slot.classroom_data || null,
                day_of_week: typeof slot.day_of_week === 'string' ? parseInt(slot.day_of_week) : slot.day_of_week
            })) as TeacherScheduleSlot[];
        },
        enabled: !!user?.id && !!tenant?.id,
    });

    // Helper selectors
    const assignments = assignmentsQuery.data || [];

    const assignedClassrooms = assignments.reduce((acc, curr) => {
        if (!acc.find(c => c.id === curr.class_id)) {
            acc.push(curr.classroom);
        }
        return acc;
    }, [] as { id: string; name: string }[]);

    const assignedSubjects = assignments.reduce((acc, curr) => {
        if (!acc.find(s => s.id === curr.subject_id)) {
            acc.push(curr.subject);
        }
        return acc;
    }, [] as { id: string; name: string }[]);

    const getSubjectsForClassroom = (classroomId: string) => {
        return assignments
            .filter(a => a.class_id === classroomId)
            .map(a => a.subject);
    };

    return {
        assignments,
        assignedClassrooms,
        assignedSubjects,
        getSubjectsForClassroom,
        schedule: scheduleQuery.data || [],
        isLoading: assignmentsQuery.isLoading || scheduleQuery.isLoading,
        isScheduleLoading: scheduleQuery.isLoading,
        isAssignmentsLoading: assignmentsQuery.isLoading,
        hasAssignments: assignments.length > 0,
    };
};
