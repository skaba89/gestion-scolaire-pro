import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { toast } from "sonner";

export interface Announcement {
    id: string;
    tenant_id: string;
    author_id: string | null;
    title: string;
    content: string;
    target_roles: string[];
    pinned: boolean;
    published_at: string | null;
    created_at: string;
    deleted_at: string | null;
}

export const communicationQueries = {
    announcements: (tenantId: string) => ({
        queryKey: ["announcements", tenantId],
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get<Announcement[]>("/communication/announcements/");
            return response.data;
        },
    }),
    messagingUsers: (tenantId: string) => ({
        queryKey: ["all-users-for-messaging", tenantId],
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get("/communication/messaging/users/");
            return response.data;
        },
        staleTime: 5 * 60 * 1000,
    }),
    teacherMessagingRecipients: (userId: string, tenantId: string) => ({
        queryKey: ['teacher-messaging-recipients', userId, tenantId] as const,
        queryFn: async () => {
            if (!userId || !tenantId) return [];
            const response = await apiClient.get("/communication/messaging/teacher-recipients/");
            return response.data;
        },
        enabled: !!userId && !!tenantId,
    }),
};

export const useCreateAnnouncement = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (announcement: Omit<Announcement, "id" | "created_at" | "deleted_at" | "published_at">) => {
            const response = await apiClient.post("/communication/announcements/", announcement);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["announcements"] });
            toast.success("Annonce publiée");
        },
        onError: (error: any) => {
            toast.error("Erreur lors de la publication : " + (error.response?.data?.detail || error.message));
        },
    });
};

export const useDeleteAnnouncement = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`/communication/announcements/${id}/`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["announcements"] });
            toast.success("Annonce supprimée");
        },
        onError: (error: any) => {
            toast.error("Erreur lors de la suppression : " + (error.response?.data?.detail || error.message));
        },
    });
};
export const useConversations = () => {
    return useQuery({
        queryKey: ["conversations"],
        queryFn: async () => {
            const response = await apiClient.get("/communication/conversations/");
            return response.data;
        },
    });
};

export const useMessages = (conversationId: string | null) => {
    return useQuery({
        queryKey: ["messages", conversationId],
        queryFn: async () => {
            if (!conversationId) return [];
            const response = await apiClient.get(`/communication/conversations/${conversationId}/messages/`);
            return response.data;
        },
        enabled: !!conversationId,
    });
};

export const useSendMessage = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ conversationId, content }: { conversationId: string; content: string }) => {
            const response = await apiClient.post(`/communication/conversations/${conversationId}/messages/`, { content });
            return response.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["messages", variables.conversationId] });
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
        },
    });
};

export const useCreateConversation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ recipientId, subject, message }: { recipientId: string; subject?: string; message: string }) => {
            const response = await apiClient.post("/communication/conversations/", { 
                recipient_id: recipientId, 
                initial_message: message 
            });
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            toast.success("Conversation créée");
        },
    });
};

export const useUnreadCount = () => {
    return useQuery({
        queryKey: ["unread-messages-count"],
        queryFn: async () => {
            const response = await apiClient.get("/communication/messaging/unread-count/");
            return response.data;
        },
        refetchInterval: 30000, // Poll every 30 seconds
    });
};
