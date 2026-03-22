/**
 * Notification Store (Zustand)
 * Global state management for toast/notification messages
 */

import { create } from "zustand";

export type NotificationType = "success" | "error" | "info" | "warning";

export interface Notification {
  id: string;
  title: string;
  description?: string;
  type: NotificationType;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  createdAt: number;
}

export interface NotificationStore {
  notifications: Notification[];
  addNotification: (
    notification: Omit<Notification, "id" | "createdAt">
  ) => string;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  updateNotification: (id: string, updates: Partial<Notification>) => void;
}

let notificationId = 0;

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],

  addNotification: (notification) => {
    const id = `notification-${++notificationId}`;
    const newNotification: Notification = {
      ...notification,
      id,
      createdAt: Date.now(),
    };

    set((state) => ({
      notifications: [...state.notifications, newNotification],
    }));

    // Auto-remove after duration
    if (notification.duration) {
      setTimeout(() => {
        get().removeNotification(id);
      }, notification.duration);
    }

    return id;
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  clearNotifications: () => {
    set({ notifications: [] });
  },

  updateNotification: (id, updates) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, ...updates } : n
      ),
    }));
  },
}));

// Helper functions for easy notification creation
export const useNotify = () => {
  const addNotification = useNotificationStore((state) => state.addNotification);

  return {
    success: (title: string, description?: string, duration = 5000) =>
      addNotification({
        title,
        description,
        type: "success",
        duration,
      }),
    error: (title: string, description?: string) =>
      addNotification({
        title,
        description,
        type: "error",
        duration: 7000,
      }),
    info: (title: string, description?: string, duration = 5000) =>
      addNotification({
        title,
        description,
        type: "info",
        duration,
      }),
    warning: (title: string, description?: string, duration = 5000) =>
      addNotification({
        title,
        description,
        type: "warning",
        duration,
      }),
  };
};
