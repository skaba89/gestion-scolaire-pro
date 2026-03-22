/**
 * Badge Notification Service
 * Handles real-time notifications, event streaming, and alert management
 */

import { supabase } from "@/integrations/supabase/client";
import { BadgeNotification } from "@/lib/badges-types";

// Global notification listeners
const notificationListeners = new Map<
  string,
  (notification: BadgeNotification) => void
>();

// =====================================================================
// NOTIFICATION SERVICE INITIALIZATION
// =====================================================================

/**
 * Initialize badge notification system for a user
 * Listens for real-time badge unlock events
 */
export function initializeBadgeNotifications(
  userId: string,
  onNotification: (notification: BadgeNotification) => void
): () => void {
  const listenerId = `badge_notify_${userId}_${Date.now()}`;
  notificationListeners.set(listenerId, onNotification);

  // Subscribe to badge unlock events via Realtime
  const channel = supabase
    .channel(`user_badges_${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "user_badges",
        filter: `user_id=eq.${userId}`,
      },
      async (payload) => {
        try {
          const newBadgeRecord = payload.new as any;

          // Fetch badge details
          const { data: badge } = await supabase
            .from("badges_definitions")
            .select("*")
            .eq("id", newBadgeRecord.badge_definition_id)
            .single();

          if (badge) {
            const notification: BadgeNotification = {
              id: newBadgeRecord.id,
              userId,
              badgeId: badge.id,
              badgeName: badge.name,
              badgeTemplate: badge.badge_template,
              badgeType: badge.badge_type,
              badgeRarity: badge.rarity,
              colorPrimary: badge.color_primary,
              colorSecondary: badge.color_secondary,
              message: `🎉 You just unlocked the "${badge.name}" badge!`,
              description: badge.description,
              timestamp: new Date(),
              seen: false,
            };

            // Notify listeners
            notificationListeners.forEach((listener) => {
              try {
                listener(notification);
              } catch (error) {
                console.error("Error in notification listener:", error);
              }
            });

            // Log notification
            await logNotification(userId, badge.id, "displayed");
          }
        } catch (error) {
          console.error("Error processing badge notification:", error);
        }
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log(`✅ Badge notifications subscribed for user ${userId}`);
      } else if (status === "CHANNEL_ERROR") {
        console.error("Badge notification channel error");
      } else if (status === "CLOSED") {
        console.log("Badge notification channel closed");
      }
    });

  // Return unsubscribe function
  return () => {
    notificationListeners.delete(listenerId);
    supabase.removeChannel(channel);
  };
}

// =====================================================================
// NOTIFICATION LOGGING
// =====================================================================

/**
 * Log a notification event to audit trail
 */
async function logNotification(
  userId: string,
  badgeId: string,
  eventType: "displayed" | "dismissed" | "shared" | "viewed"
): Promise<void> {
  try {
    await supabase.from("badge_unlock_logs").insert({
      user_id: userId,
      badge_definition_id: badgeId,
      event_type: `notification_${eventType}`,
      event_data: {
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
      },
    });
  } catch (error) {
    console.error("Error logging notification:", error);
  }
}

// =====================================================================
// NOTIFICATION UI HELPERS
// =====================================================================

/**
 * Dismiss a notification (mark as seen)
 */
export async function dismissNotification(badgeId: string): Promise<void> {
  try {
    await supabase.from("user_badges").update({ seen: true }).eq("id", badgeId);
    await logNotification("", badgeId, "dismissed");
  } catch (error) {
    console.error("Error dismissing notification:", error);
  }
}

/**
 * Mark notification as viewed/clicked
 */
export async function viewNotification(badgeId: string): Promise<void> {
  try {
    await logNotification("", badgeId, "viewed");
  } catch (error) {
    console.error("Error logging view:", error);
  }
}

/**
 * Share badge notification
 */
export async function shareNotification(
  badgeId: string,
  platform: "twitter" | "facebook" | "whatsapp" | "clipboard" = "clipboard"
): Promise<{ success: boolean; message: string }> {
  try {
    // Try native share API first
    if (navigator.share && platform !== "clipboard") {
      await navigator.share({
        title: "I just earned a badge!",
        text: "Check out my new achievement on SchoolFlow Pro",
        url: window.location.href,
      });
      await logNotification("", badgeId, "shared");
      return { success: true, message: "Shared successfully" };
    }

    // Fallback to clipboard
    const shareUrl = `${window.location.origin}?badge=${badgeId}`;
    await navigator.clipboard.writeText(shareUrl);
    await logNotification("", badgeId, "shared");

    return {
      success: true,
      message: "Badge link copied to clipboard",
    };
  } catch (error) {
    console.error("Error sharing notification:", error);
    return {
      success: false,
      message: "Failed to share badge",
    };
  }
}

// =====================================================================
// NOTIFICATION QUEUE MANAGEMENT
// =====================================================================

class NotificationQueue {
  private queue: BadgeNotification[] = [];
  private isProcessing = false;
  private processingDelay = 3000; // 3s between notifications

  add(notification: BadgeNotification): void {
    this.queue.push(notification);
    this.process();
  }

  private async process(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const notification = this.queue.shift();
      if (notification) {
        // Display notification via UI (should be handled by NotificationContainer)
        await new Promise((resolve) =>
          setTimeout(resolve, this.processingDelay)
        );
      }
    }

    this.isProcessing = false;
  }

  getQueue(): BadgeNotification[] {
    return [...this.queue];
  }

  clear(): void {
    this.queue = [];
  }
}

export const badgeNotificationQueue = new NotificationQueue();

// =====================================================================
// EMAIL NOTIFICATIONS (via Supabase Edge Functions)
// =====================================================================

/**
 * Send email notification for badge unlock
 * Called via Supabase Edge Function
 */
export async function sendBadgeUnlockEmail(
  userId: string,
  badgeName: string,
  badgeDescription: string,
  userEmail: string
): Promise<{ success: boolean; messageId?: string }> {
  try {
    // Call Supabase Edge Function
    const { data, error } = await supabase.functions.invoke(
      "send-badge-email",
      {
        body: {
          userId,
          badgeName,
          badgeDescription,
          userEmail,
          timestamp: new Date().toISOString(),
        },
      }
    );

    if (error) {
      console.error("Error sending email:", error);
      return { success: false };
    }

    return {
      success: true,
      messageId: data?.messageId,
    };
  } catch (error) {
    console.error("Error invoking email function:", error);
    return { success: false };
  }
}

// =====================================================================
// PUSH NOTIFICATIONS (via Capacitor)
// =====================================================================

/**
 * Send push notification for badge unlock (mobile)
 */
export async function sendPushNotification(
  title: string,
  message: string,
  badgeId: string,
  largeIcon?: string
): Promise<{ success: boolean }> {
  try {
    // Check if running on mobile
    if (!window.Capacitor || !window.Capacitor.isPluginAvailable("LocalNotifications")) {
      console.log("Push notifications not available on this platform");
      return { success: false };
    }

    const { LocalNotifications } = window.Capacitor.Plugins;

    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Math.random() * 1000000),
          title,
          body: message,
          largeBody: message,
          smallIcon: "ic_stat_ic_notification",
          iconColor: "#FF6B6B",
          largeIcon,
          actionTypeId: "badge",
          extra: {
            badgeId,
          },
        },
      ],
    });

    return { success: true };
  } catch (error) {
    console.error("Error sending push notification:", error);
    return { success: false };
  }
}

// =====================================================================
// NOTIFICATION PREFERENCES
// =====================================================================

/**
 * Fetch user notification preferences
 */
export async function getNotificationPreferences(userId: string) {
  try {
    const preferences = localStorage.getItem(`badge_prefs_${userId}`);
    return preferences
      ? JSON.parse(preferences)
      : {
          toastEnabled: true,
          emailEnabled: false,
          pushEnabled: true,
          soundEnabled: true,
          mutedBadges: [] as string[],
        };
  } catch (error) {
    console.error("Error fetching preferences:", error);
    return null;
  }
}

/**
 * Update user notification preferences
 */
export async function updateNotificationPreferences(userId: string, prefs: any) {
  try {
    localStorage.setItem(`badge_prefs_${userId}`, JSON.stringify(prefs));
    return { success: true };
  } catch (error) {
    console.error("Error updating preferences:", error);
    return { success: false };
  }
}

/**
 * Mute notifications for specific badge type
 */
export async function muteBadgeNotifications(
  userId: string,
  badgeType: string
): Promise<void> {
  const prefs = await getNotificationPreferences(userId);
  if (!prefs.mutedBadges.includes(badgeType)) {
    prefs.mutedBadges.push(badgeType);
    await updateNotificationPreferences(userId, prefs);
  }
}

/**
 * Unmute notifications for specific badge type
 */
export async function unmuteBadgeNotifications(
  userId: string,
  badgeType: string
): Promise<void> {
  const prefs = await getNotificationPreferences(userId);
  prefs.mutedBadges = prefs.mutedBadges.filter(
    (t: string) => t !== badgeType
  );
  await updateNotificationPreferences(userId, prefs);
}

// =====================================================================
// SOUND/HAPTIC FEEDBACK
// =====================================================================

/**
 * Play notification sound
 */
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
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + 0.5
    );

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (error) {
    console.error("Error playing sound:", error);
  }
}

/**
 * Trigger haptic feedback (mobile)
 */
export async function triggerHapticFeedback(
  duration: number = 50
): Promise<void> {
  try {
    if (!window.Capacitor || !window.Capacitor.isPluginAvailable("Haptics")) {
      return;
    }

    const { Haptics } = window.Capacitor.Plugins;
    await Haptics.vibrate({ duration });
  } catch (error) {
    console.error("Error triggering haptics:", error);
  }
}

// =====================================================================
// NOTIFICATION HISTORY
// =====================================================================

/**
 * Get notification history for user
 */
export async function getNotificationHistory(
  userId: string,
  tenantId: string,
  limit: number = 20
) {
  try {
    const { data, error } = await supabase
      .from("badge_unlock_logs")
      .select(
        `
        id,
        badge_definition_id,
        event_type,
        event_data,
        created_at,
        badge:badge_definition_id (
          name,
          badge_type,
          rarity
        )
      `
      )
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error fetching notification history:", error);
    return [];
  }
}

/**
 * Clear notification history
 */
export async function clearNotificationHistory(userId: string): Promise<void> {
  try {
    await supabase
      .from("badge_unlock_logs")
      .delete()
      .eq("user_id", userId)
      .eq("event_type", "notification_displayed");
  } catch (error) {
    console.error("Error clearing history:", error);
  }
}
