import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { apiClient } from "@/api/client";

interface DashboardChild {
    student_id: string;
    first_name?: string;
    last_name?: string;
    registration_number?: string;
    photo_url?: string | null;
    date_of_birth?: string | null;
    student?: Record<string, unknown>;
    students?: Record<string, unknown>;
}

export const useParentData = () => {
    const { user } = useAuth();
    const { tenant } = useTenant();

    const dashboardQuery = useQuery({
        queryKey: ["parent-dashboard", user?.id, tenant?.id],
        queryFn: async () => {
            if (!user?.id || !tenant?.id) return null;
            const { data } = await apiClient.get('/parents/dashboard/');
            if (!Array.isArray(data?.children) || !Array.isArray(data?.unpaidInvoices)) {
                throw new Error("Réponse du tableau de bord parent invalide");
            }
            return data;
        },
        enabled: !!user?.id && !!tenant?.id,
    });

    const data = dashboardQuery.data || {
        children: [],
        unpaidInvoices: [],
        upcomingEvents: [],
        notifications: [],
        unreadMessagesCount: 0,
        recentGrades: [],
        attendanceAlerts: [],
        latestScans: []
    };

    const children = data.children.map((child: DashboardChild) => ({
        ...child,
        student: child.student ?? child.students ?? {
            id: child.student_id, first_name: child.first_name, last_name: child.last_name,
            registration_number: child.registration_number, photo_url: child.photo_url,
            date_of_birth: child.date_of_birth,
        },
    }));
    const studentIds = children.map((child: DashboardChild) => child.student_id);

    const totalUnpaid = data.unpaidInvoices.reduce((sum: number, inv: any) =>
        sum + (inv.total_amount - (inv.paid_amount || 0)), 0) || 0;

    return {
        children,
        unpaidInvoices: data.unpaidInvoices,
        upcomingEvents: data.upcomingEvents,
        notifications: data.notifications,
        unreadMessagesCount: data.unreadMessagesCount,
        recentGrades: data.recentGrades,
        attendanceAlerts: data.attendanceAlerts,
        latestScans: data.latestScans,
        totalUnpaid,
        isLoading: dashboardQuery.isLoading,
        studentIds,
        queries: {
            dashboard: dashboardQuery,
        }
    };
};
