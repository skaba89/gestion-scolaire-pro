/**
 * Tests for Notification Store (Zustand)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useNotificationStore, useNotify } from "@/stores/notificationStore";

describe("Notification Store", () => {
  beforeEach(() => {
    // Reset store
    useNotificationStore.setState({ notifications: [] });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  describe("addNotification", () => {
    it("should add notification with id", () => {
      const id = useNotificationStore.getState().addNotification({
        title: "Success",
        type: "success",
      });

      expect(id).toMatch(/^notification-\d+$/);
      const { notifications } = useNotificationStore.getState();
      expect(notifications.length).toBe(1);
      expect(notifications[0].title).toBe("Success");
    });

    it("should set creation timestamp", () => {
      const before = Date.now();
      useNotificationStore.getState().addNotification({
        title: "Test",
        type: "info",
      });
      const after = Date.now();

      const { notifications } = useNotificationStore.getState();
      expect(notifications[0].createdAt >= before && notifications[0].createdAt <= after).toBe(
        true
      );
    });

    it("should auto-dismiss notification after duration", () => {
      useNotificationStore.getState().addNotification({
        title: "Auto-dismiss",
        type: "success",
        duration: 1000,
      });

      expect(useNotificationStore.getState().notifications.length).toBe(1);

      vi.advanceTimersByTime(1000);

      expect(useNotificationStore.getState().notifications.length).toBe(0);
    });
  });

  describe("removeNotification", () => {
    it("should remove notification by id", () => {
      const id = useNotificationStore.getState().addNotification({
        title: "Test",
        type: "info",
      });

      useNotificationStore.getState().removeNotification(id);

      expect(useNotificationStore.getState().notifications.length).toBe(0);
    });

    it("should only remove specific notification", () => {
      const id1 = useNotificationStore.getState().addNotification({
        title: "First",
        type: "success",
      });
      const id2 = useNotificationStore.getState().addNotification({
        title: "Second",
        type: "error",
      });

      useNotificationStore.getState().removeNotification(id1);

      const { notifications } = useNotificationStore.getState();
      expect(notifications.length).toBe(1);
      expect(notifications[0].id).toBe(id2);
    });
  });

  describe("clearNotifications", () => {
    it("should clear all notifications", () => {
      useNotificationStore.getState().addNotification({
        title: "First",
        type: "success",
      });
      useNotificationStore.getState().addNotification({
        title: "Second",
        type: "error",
      });

      useNotificationStore.getState().clearNotifications();

      expect(useNotificationStore.getState().notifications.length).toBe(0);
    });
  });

  describe("updateNotification", () => {
    it("should update notification fields", () => {
      const id = useNotificationStore.getState().addNotification({
        title: "Test",
        type: "info",
      });

      useNotificationStore.getState().updateNotification(id, {
        title: "Updated",
        description: "Now with description",
      });

      const { notifications } = useNotificationStore.getState();
      expect(notifications[0].title).toBe("Updated");
      expect(notifications[0].description).toBe("Now with description");
      expect(notifications[0].type).toBe("info"); // Unchanged
    });
  });

  describe("useNotify helper", () => {
    it("should create success notification", () => {
      const { success } = useNotify();
      success("Success message", "With description");

      const { notifications } = useNotificationStore.getState();
      expect(notifications[0].type).toBe("success");
      expect(notifications[0].title).toBe("Success message");
      expect(notifications[0].description).toBe("With description");
    });

    it("should create error notification", () => {
      const { error } = useNotify();
      error("Error message", "Error details");

      const { notifications } = useNotificationStore.getState();
      expect(notifications[0].type).toBe("error");
      expect(notifications[0].title).toBe("Error message");
    });

    it("should create info notification", () => {
      const { info } = useNotify();
      info("Info message");

      const { notifications } = useNotificationStore.getState();
      expect(notifications[0].type).toBe("info");
    });

    it("should create warning notification", () => {
      const { warning } = useNotify();
      warning("Warning message");

      const { notifications } = useNotificationStore.getState();
      expect(notifications[0].type).toBe("warning");
    });

    it("should set correct durations per type", () => {
      const { success, error, info } = useNotify();

      success("Success");
      error("Error");
      info("Info");

      const { notifications } = useNotificationStore.getState();

      // Find notifications by type and check duration
      const successNotif = notifications.find((n) => n.type === "success");
      const errorNotif = notifications.find((n) => n.type === "error");
      const infoNotif = notifications.find((n) => n.type === "info");

      expect(successNotif?.duration).toBe(5000);
      expect(errorNotif?.duration).toBe(7000);
      expect(infoNotif?.duration).toBe(5000);
    });
  });

  describe("notification ordering", () => {
    it("should maintain insertion order", () => {
      useNotificationStore.getState().addNotification({
        title: "First",
        type: "success",
      });
      useNotificationStore.getState().addNotification({
        title: "Second",
        type: "error",
      });
      useNotificationStore.getState().addNotification({
        title: "Third",
        type: "warning",
      });

      const { notifications } = useNotificationStore.getState();

      expect(notifications[0].title).toBe("First");
      expect(notifications[1].title).toBe("Second");
      expect(notifications[2].title).toBe("Third");
    });
  });
});
