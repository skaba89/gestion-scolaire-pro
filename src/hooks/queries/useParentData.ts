import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
            const { data, error } = await supabase
                .from("parent_students")
                .select(`
          id,
          is_primary,
          relationship,
          students (
            id, 
            first_name, 
            last_name, 
            registration_number, 
            photo_url,
            date_of_birth,
            gender,
            email,
            phone,
            address
          )
        `)
                .eq("parent_id", user.id);

            if (error) throw error;

            return data.map(item => ({
                id: item.id,
                is_primary: item.is_primary,
                relationship: item.relationship,
                student: item.students as any
            })) as ParentChild[];
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

            const { data, error } = await supabase
                .from("invoices")
                .select("*")
                .in("student_id", studentIds)
                .in("status", ["PENDING", "PARTIAL", "OVERDUE"]);

            if (error) throw error;
            return data;
        },
        enabled: !!user?.id && !!children && children.length > 0,
    });

    // 3. Fetch Upcoming Events (Tenant level)
    const { data: upcomingEvents, isLoading: eventsLoading } = useQuery({
        queryKey: ["parent-upcoming-events", tenant?.id],
        queryFn: async () => {
            if (!tenant?.id) return [];

            const today = new Date().toISOString().split("T")[0];
            const { data, error } = await supabase
                .from("school_events")
                .select("*")
                .eq("tenant_id", tenant.id)
                .gte("start_date", today)
                .order("start_date", { ascending: true })
                .limit(5);

            if (error) throw error;
            return data;
        },
        enabled: !!tenant?.id,
    });

    // 4. Fetch Notifications
    const { data: notifications, isLoading: notificationsLoading } = useQuery({
        queryKey: ["parent-notifications", user?.id],
        queryFn: async () => {
            if (!user?.id) return [];
            const { data, error } = await supabase
                .from("notifications")
                .select("*")
                .eq("user_id", user.id)
                .eq("is_read", false)
                .order("created_at", { ascending: false })
                .limit(5);

            if (error) throw error;
            return data;
        },
        enabled: !!user?.id,
    });

    // 5. Fetch Unread Messages Count
    const { data: unreadMessagesCount, isLoading: messagesLoading } = useQuery({
        queryKey: ["parent-unread-messages", user?.id],
        queryFn: async () => {
            if (!user?.id) return 0;

            // Get conversations the user participates in
            const { data: participations } = await supabase
                .from("conversation_participants")
                .select("conversation_id, last_read_at")
                .eq("user_id", user.id);

            if (!participations?.length) return 0;

            let unreadCount = 0;
            for (const p of participations) {
                const query = supabase
                    .from("messages")
                    .select("id", { count: "exact", head: true })
                    .eq("conversation_id", p.conversation_id)
                    .neq("sender_id", user.id);

                if (p.last_read_at) {
                    query.gt("created_at", p.last_read_at);
                }

                const { count } = await query;
                unreadCount += count || 0;
            }

            return unreadCount;
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
