import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { apiClient } from "@/api/client";

export const useParentData = () => {
    const { user } = useAuth();
    const { tenant } = useTenant();

    const dashboardQuery = useQuery({
        queryKey: ["parent-dashboard", user?.id],
        queryFn: async () => {
            if (!user?.id || !tenant?.id) return null;
            const { data } = await apiClient.get('/parents/dashboard');
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

    const studentIds = data.children.map((c: any) => c.student_id) || [];

    const totalUnpaid = data.unpaidInvoices.reduce((sum: number, inv: any) =>
        sum + (inv.total_amount - (inv.paid_amount || 0)), 0) || 0;

    return {
        children: data.children,
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
