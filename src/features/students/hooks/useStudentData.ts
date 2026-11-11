import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { apiClient } from "@/api/client";

/**
 * Données du portail élève, depuis GET /students/dashboard/ (un seul appel,
 * partagé en cache par toutes les pages qui l'utilisent).
 * `enabled: false` permet à un composant commun à plusieurs portails
 * (ReminderSystem) de ne pas l'appeler pour un autre rôle.
 */
export const useStudentData = ({ enabled = true }: { enabled?: boolean } = {}) => {
    const { user } = useAuth();
    const { tenant } = useTenant();

    const dashboardQuery = useQuery({
        queryKey: ["student-dashboard", user?.id, tenant?.id],
        queryFn: async () => {
            if (!user?.id || !tenant?.id) return null;
            const { data } = await apiClient.get('/students/dashboard/');
            return data;
        },
        enabled: enabled && !!user?.id && !!tenant?.id,
    });

    const data = dashboardQuery.data || {
        student: null,
        enrollment: null,
        grades: [],
        homework: [],
        schedule: [],
        checkInHistory: [],
        submissions: []
    };

    return {
        student: data.student,
        enrollment: data.enrollment,
        grades: data.grades,
        homework: data.homework,
        schedule: data.schedule,
        checkInHistory: data.checkInHistory,
        submissions: data.submissions,
        isLoading: dashboardQuery.isLoading,
        studentId: data.student?.id,
        classId: data.enrollment?.class_id,
        queries: {
            dashboard: dashboardQuery
        }
    };
};
