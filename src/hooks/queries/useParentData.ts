import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";

export interface ParentChild {
    id: string; // The relationship ID
    student: {
        id: string;
        first_name: string;
        last_name: string;
        registration_number: string;
        photo_url: string | null;
        date_of_birth?: string;
        gender?: string;
        email?: string;
        phone?: string;
        address?: string;
    };
    is_primary: boolean;
    relationship: string;
}

export const useParentData = () => {
    const { user } = useAuth();
    const { tenant } = useTenant();

    // 1. Fetch Children
    const { data: children, isLoading: childrenLoading } = useQuery({
        queryKey: ["parent-children", user?.id],
        queryFn: async () => {
            if (!user?.id) return [];
            const { data } = await apiClient.get("/parents/children/");
            return (data?.results ?? data ?? []) as ParentChild[];
        },
        enabled: !!user?.id,
    });

    // 2. Fetch Unpaid Invoices (Dependant on children)
    const { data: unpaidInvoices, isLoading: invoicesLoading } = useQuery({
        queryKey: ["parent-unpaid-invoices", user?.id],
        queryFn: async () => {
            if (!user?.id || !children?.length) return [];

            const studentIds = children.map(c => c.student.id).filter(Boolean);
            if (studentIds.length === 0) return [];

            const { data } = await apiClient.get("/invoices/", {
                params: {
                    student_ids: studentIds.join(","),
                    status: "PENDING,PARTIAL,OVERDUE",
                },
            });
            return data?.results ?? data ?? [];
        },
        enabled: !!user?.id && !!children && children.length > 0,
    });

    // 3. Fetch Upcoming Events (Tenant level)
    const { data: upcomingEvents, isLoading: eventsLoading } = useQuery({
        queryKey: ["parent-upcoming-events", tenant?.id],
        queryFn: async () => {
            if (!tenant?.id) return [];

            const today = new Date().toISOString().split("T")[0];
            const { data } = await apiClient.get("/school-events/", {
                params: {
                    start_date_after: today,
                    ordering: "start_date",
                    page_size: 5,
                },
            });
            return data?.results ?? data ?? [];
        },
        enabled: !!tenant?.id,
    });

    // 4. Fetch Notifications
    const { data: notifications, isLoading: notificationsLoading } = useQuery({
        queryKey: ["parent-notifications", user?.id],
        queryFn: async () => {
            if (!user?.id) return [];
            const { data } = await apiClient.get("/notifications/", {
                params: {
                    is_read: false,
                    ordering: "-created_at",
                    page_size: 5,
                },
            });
            return data?.results ?? data ?? [];
        },
        enabled: !!user?.id,
    });

    // 5. Fetch Unread Messages Count
    const { data: unreadMessagesCount, isLoading: messagesLoading } = useQuery({
        queryKey: ["parent-unread-messages", user?.id],
        queryFn: async () => {
            if (!user?.id) return 0;

            const { data } = await apiClient.get("/communication/messaging/unread-count/");
            return data?.unread_count ?? data?.count ?? 0;
        },
        enabled: !!user?.id,
    });

    const isLoading = childrenLoading || invoicesLoading || eventsLoading || notificationsLoading || messagesLoading;
    const totalUnpaid = unpaidInvoices?.reduce((sum, inv) => sum + (inv.total_amount - (inv.paid_amount || 0)), 0) || 0;

    return {
        children,
        unpaidInvoices,
        upcomingEvents,
        notifications,
        unreadMessagesCount,
        totalUnpaid,
        isLoading
    };
};
