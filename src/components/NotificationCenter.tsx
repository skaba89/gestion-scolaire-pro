/**
 * NotificationCenter Component
 * Displays notifications from the notification store
 */

import { useEffect } from "react";
import { useNotificationStore } from "@/stores/notificationStore";
import {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

function NotificationItem() {
  const notifications = useNotificationStore((state) => state.notifications);
  const removeNotification = useNotificationStore(
    (state) => state.removeNotification
  );

  return (
    <ToastViewport className="fixed bottom-0 right-0 flex flex-col gap-2 p-4 max-w-md">
      {notifications.map((notification) => (
        <Toast
          key={notification.id}
          className={`
            ${notification.type === "success" ? "bg-green-50 border-green-200" : ""}
            ${notification.type === "error" ? "bg-red-50 border-red-200" : ""}
            ${notification.type === "warning" ? "bg-yellow-50 border-yellow-200" : ""}
            ${notification.type === "info" ? "bg-blue-50 border-blue-200" : ""}
          `}
        >
          <ToastTitle className={`
            ${notification.type === "success" ? "text-green-900" : ""}
            ${notification.type === "error" ? "text-red-900" : ""}
            ${notification.type === "warning" ? "text-yellow-900" : ""}
            ${notification.type === "info" ? "text-blue-900" : ""}
          `}>
            {notification.title}
          </ToastTitle>
          {notification.description && (
            <ToastDescription className={`
              ${notification.type === "success" ? "text-green-800" : ""}
              ${notification.type === "error" ? "text-red-800" : ""}
              ${notification.type === "warning" ? "text-yellow-800" : ""}
              ${notification.type === "info" ? "text-blue-800" : ""}
            `}>
              {notification.description}
            </ToastDescription>
          )}
          {notification.action && (
            <ToastAction
              altText={notification.action.label}
              onClick={notification.action.onClick}
            >
              {notification.action.label}
            </ToastAction>
          )}
          <ToastClose onClick={() => removeNotification(notification.id)} />
        </Toast>
      ))}
    </ToastViewport>
  );
}

export function NotificationCenter() {
  return (
    <ToastProvider>
      <NotificationItem />
    </ToastProvider>
  );
}
