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
  _timers: Map<string, ReturnType<typeof setTimeout>>;
}

let notificationId = 0;

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  _timers: new Map<string, ReturnType<typeof setTimeout>>(),

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

    // Auto-remove after duration, store timer for cleanup
    if (notification.duration) {
      const timer = setTimeout(() => {
        get().removeNotification(id);
      }, notification.duration);
      get()._timers.set(id, timer);
    }

    return id;
  },

  removeNotification: (id) => {
    // Clear auto-remove timer if it exists
    const timer = get()._timers.get(id);
    if (timer) {
      clearTimeout(timer);
      get()._timers.delete(id);
    }
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  clearNotifications: () => {
    // Clear all pending timers
    const timers = get()._timers;
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
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
