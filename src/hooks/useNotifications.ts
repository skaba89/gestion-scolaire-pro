import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";

interface CreateNotificationParams {
  userId: string;
  title: string;
  message?: string;
  type?: "info" | "grade" | "message" | "event" | "alert";
  link?: string;
}

export const useCreateNotification = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateNotificationParams) => {
      const response = await apiClient.post('/notifications/', {
        user_id: params.userId,
        title: params.title,
        message: params.message,
        type: params.type || "info",
        link: params.link,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
};

export const useBulkNotifications = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notifications: CreateNotificationParams[]) => {
      const notificationsToInsert = notifications.map((n) => ({
        user_id: n.userId,
        title: n.title,
        message: n.message,
        type: n.type || "info",
        link: n.link,
      }));

      const response = await apiClient.post('/notifications/bulk/', { notifications: notificationsToInsert });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
};
