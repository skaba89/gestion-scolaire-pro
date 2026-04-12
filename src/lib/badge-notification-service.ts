/**
 * Badge Notification Service
 * Handles real-time notifications, event streaming, and alert management
 */

import { apiClient } from "@/api/client";
import { BadgeNotification } from "@/lib/badges-types";

const notificationListeners = new Map<
  string,
  (notification: BadgeNotification) => void
>();

/**
 * Initialize badge notification system for a user
 * In API-based architecture, uses polling instead of realtime channels
 */
export function initializeBadgeNotifications(
  _userId: string,
  onNotification: (notification: BadgeNotification) => void
): () => void {
  const listenerId = `badge_notify_${_userId}_${Date.now()}`;
  notificationListeners.set(listenerId, onNotification);

  // In API architecture, realtime is replaced by polling or WebSocket
  // The caller should poll /school-life/badges/ for changes
  console.info(`Badge notifications initialized for user ${_userId} (polling mode)`);

  return () => {
    notificationListeners.delete(listenerId);
  };
}

async function logNotification(
  userId: string,
  badgeId: string,
  eventType: "displayed" | "dismissed" | "shared" | "viewed"
): Promise<void> {
  try {
    await apiClient.post("/school-life/badges/unlock-logs/", {
      user_id: userId,
      badge_definition_id: badgeId,
      event_type: `notification_${eventType}`,
      event_data: { timestamp: new Date().toISOString(), userAgent: navigator.userAgent },
    });
  } catch (error) {
    console.error("Error logging notification:", error);
  }
}

export async function dismissNotification(badgeId: string): Promise<void> {
  try {
    await apiClient.patch(`/school-life/badges/${badgeId}/`, { seen: true });
    await logNotification("", badgeId, "dismissed");
  } catch (error) {
    console.error("Error dismissing notification:", error);
  }
}

export async function viewNotification(badgeId: string): Promise<void> {
  try {
    await logNotification("", badgeId, "viewed");
  } catch (error) {
    console.error("Error logging view:", error);
  }
}

export async function shareNotification(
  badgeId: string,
  platform: "twitter" | "facebook" | "whatsapp" | "clipboard" = "clipboard"
): Promise<{ success: boolean; message: string }> {
  try {
    if (navigator.share && platform !== "clipboard") {
      await navigator.share({
        title: "I just earned a badge!",
        text: "Check out my new achievement!",
        url: window.location.href,
      });
      await logNotification("", badgeId, "shared");
      return { success: true, message: "Shared successfully" };
    }

    const shareUrl = `${window.location.origin}?badge=${badgeId}`;
    await navigator.clipboard.writeText(shareUrl);
    await logNotification("", badgeId, "shared");
    return { success: true, message: "Badge link copied to clipboard" };
  } catch (error) {
    console.error("Error sharing notification:", error);
    return { success: false, message: "Failed to share badge" };
  }
}

class NotificationQueue {
  private queue: BadgeNotification[] = [];
  private isProcessing = false;
  private processingDelay = 3000;

  add(notification: BadgeNotification): void {
    this.queue.push(notification);
    this.process();
  }

  private async process(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;
    while (this.queue.length > 0) {
      this.queue.shift();
      await new Promise((resolve) => setTimeout(resolve, this.processingDelay));
    }
    this.isProcessing = false;
  }

  getQueue(): BadgeNotification[] { return [...this.queue]; }
  clear(): void { this.queue = []; }
}

export const badgeNotificationQueue = new NotificationQueue();

export async function sendBadgeUnlockEmail(
  userId: string,
  badgeName: string,
  badgeDescription: string,
  userEmail: string
): Promise<{ success: boolean; messageId?: string }> {
  try {
    const { data } = await apiClient.post("/communication/send-badge-email/", {
      userId, badgeName, badgeDescription, userEmail, timestamp: new Date().toISOString(),
    });
    return { success: true, messageId: data?.messageId };
  } catch (error) {
    console.error("Error sending badge email:", error);
    return { success: false };
  }
}

export async function sendPushNotification(
  _title: string,
  _message: string,
  _badgeId: string,
  _largeIcon?: string
): Promise<{ success: boolean }> {
  try {
    if (!window.Capacitor || !(window.Capacitor as any).isPluginAvailable?.("LocalNotifications")) {
      return { success: false };
    }
    const { LocalNotifications } = (window.Capacitor as any).Plugins;
    await LocalNotifications.schedule({
      notifications: [{
        id: Math.floor(Math.random() * 1000000),
        title: _title,
        body: _message,
        smallIcon: "ic_stat_ic_notification",
        iconColor: "#FF6B6B",
        largeIcon: _largeIcon,
        actionTypeId: "badge",
        extra: { badgeId: _badgeId },
      }],
    });
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function getNotificationPreferences(userId: string) {
  try {
    const preferences = localStorage.getItem(`badge_prefs_${userId}`);
    return preferences
      ? JSON.parse(preferences)
      : { toastEnabled: true, emailEnabled: false, pushEnabled: true, soundEnabled: true, mutedBadges: [] as string[] };
  } catch { return null; }
}

export async function updateNotificationPreferences(userId: string, prefs: any) {
  try {
    localStorage.setItem(`badge_prefs_${userId}`, JSON.stringify(prefs));
    return { success: true };
  } catch { return { success: false }; }
}

export async function muteBadgeNotifications(userId: string, badgeType: string): Promise<void> {
  const prefs = await getNotificationPreferences(userId);
  if (!prefs.mutedBadges.includes(badgeType)) {
    prefs.mutedBadges.push(badgeType);
    await updateNotificationPreferences(userId, prefs);
  }
}

export async function unmuteBadgeNotifications(userId: string, badgeType: string): Promise<void> {
  const prefs = await getNotificationPreferences(userId);
  prefs.mutedBadges = prefs.mutedBadges.filter((t: string) => t !== badgeType);
  await updateNotificationPreferences(userId, prefs);
}

export function playNotificationSound(): void {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.value = 800;
    oscillator.type = "sine";
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (error) {
    console.error("Error playing sound:", error);
  }
}

export async function triggerHapticFeedback(duration: number = 50): Promise<void> {
  try {
    if (!window.Capacitor || !(window.Capacitor as any).isPluginAvailable?.("Haptics")) return;
    const { Haptics } = (window.Capacitor as any).Plugins;
    await Haptics.vibrate({ duration });
  } catch {}
}

export async function getNotificationHistory(userId: string, tenantId: string, limit: number = 20) {
  try {
    const { data } = await apiClient.get<any[]>("/school-life/badges/unlock-logs/", {
      params: { user_id: userId, tenant_id: tenantId, limit: String(limit) },
    });
    return data;
  } catch {
    return [];
  }
}

export async function clearNotificationHistory(userId: string): Promise<void> {
  try {
    await apiClient.delete("/school-life/badges/unlock-logs/", {
      params: { user_id: userId, event_type: "notification_displayed" },
    });
  } catch (error) {
    console.error("Error clearing history:", error);
  }
}
