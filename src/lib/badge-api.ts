/**
 * Badge API Routes and Backend Logic
 * Handles all badge-related operations: unlock, stats, notifications, leaderboard
 */

import { supabase } from "@/integrations/supabase/client";
import {
  BadgeUnlockResult,
  BadgeNotification,
  BadgeLeaderboardEntry,
} from "@/lib/badges-types";

// =====================================================================
// API: GET /api/badges
// Fetch all badge definitions for a tenant
// =====================================================================
export async function fetchBadgeDefinitions(tenantId: string) {
  const { data, error } = await supabase
    .from("badges_definitions")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data;
}

// =====================================================================
// API: GET /api/badges/user/:userId
// Fetch all badges earned by a specific user
// =====================================================================
export async function fetchUserBadges(userId: string, tenantId: string) {
  const { data, error } = await supabase
    .from("user_badges")
    .select(
      `
      id,
      tenant_id,
      user_id,
      badge_definition_id,
      earned_date,
      seen,
      shared,
      created_at,
      updated_at,
      badge:badge_definition_id (*)
    `
    )
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .order("earned_date", { ascending: false });

  if (error) throw error;
  return data;
}

// =====================================================================
// API: POST /api/badges/unlock
// Award a badge to a user (admin or trigger-based)
// =====================================================================
export async function awardBadge(
  userId: string,
  tenantId: string,
  badgeDefinitionId: string,
  eventType: string = "manual"
): Promise<BadgeUnlockResult> {
  try {
    // Check if already unlocked
    const { data: existing, error: checkError } = await supabase
      .from("user_badges")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("badge_definition_id", badgeDefinitionId)
      .single();

    if (existing) {
      return {
        success: false,
        message: "Badge already unlocked by this user",
        isNew: false,
      };
    }

    // Insert new badge
    const { data: newBadge, error: insertError } = await supabase
      .from("user_badges")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        badge_definition_id: badgeDefinitionId,
        earned_date: new Date().toISOString(),
        seen: false,
        shared: false,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Log the unlock event
    const { error: logError } = await supabase
      .from("badge_unlock_logs")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        badge_definition_id: badgeDefinitionId,
        event_type: eventType,
        event_data: { timestamp: new Date().toISOString() },
      });

    if (logError) console.error("Error logging badge unlock:", logError);

    // Fetch badge details for notification
    const { data: badge } = await supabase
      .from("badges_definitions")
      .select("*")
      .eq("id", badgeDefinitionId)
      .single();

    return {
      success: true,
      badgeId: newBadge.id,
      badgeName: badge?.name || "Unknown Badge",
      message: `🎉 Congratulations! You unlocked "${badge?.name}"!`,
      isNew: true,
    };
  } catch (error) {
    console.error("Error awarding badge:", error);
    return {
      success: false,
      message: "Failed to unlock badge",
      isNew: false,
    };
  }
}

// =====================================================================
// API: PATCH /api/badges/user/:badgeId/seen
// Mark a badge as seen by the user
// =====================================================================
export async function markBadgeAsSeen(badgeId: string): Promise<void> {
  const { error } = await supabase
    .from("user_badges")
    .update({ seen: true })
    .eq("id", badgeId);

  if (error) throw error;
}

// =====================================================================
// API: PATCH /api/badges/user/:badgeId/share
// Toggle badge sharing status
// =====================================================================
export async function toggleBadgeShare(badgeId: string, shared: boolean): Promise<void> {
  const { error } = await supabase
    .from("user_badges")
    .update({ shared })
    .eq("id", badgeId);

  if (error) throw error;
}

// =====================================================================
// API: GET /api/badges/stats/:userId
// Get badge statistics for a user
// =====================================================================
export async function fetchUserBadgeStats(userId: string, tenantId: string) {
  // Get all user badges
  const userBadges = await fetchUserBadges(userId, tenantId);

  // Get all badge definitions
  const allBadges = await fetchBadgeDefinitions(tenantId);

  // Calculate stats
  const stats = {
    totalBadges: userBadges.length,
    badgesByType: {
      performance: 0,
      achievement: 0,
      certification: 0,
      attendance: 0,
      participation: 0,
    },
    badgesByTemplate: {
      circle: 0,
      ribbon: 0,
      "3d": 0,
      minimalist: 0,
      animated: 0,
    },
    badgesByRarity: {
      common: 0,
      uncommon: 0,
      rare: 0,
      epic: 0,
      legendary: 0,
    },
    recentBadges: userBadges.slice(0, 3),
    nextMilestones: allBadges.filter(
      (b) => !userBadges.find((ub) => ub.badge_definition_id === b.id)
    ),
  };

  for (const badge of userBadges) {
    if (badge.badge) {
      stats.badgesByType[badge.badge.badge_type as any]++;
      stats.badgesByTemplate[badge.badge.badge_template as any]++;
      stats.badgesByRarity[badge.badge.rarity as any]++;
    }
  }

  return stats;
}

// =====================================================================
// API: GET /api/badges/leaderboard/:classId
// Get class leaderboard sorted by badge count
// =====================================================================
export async function fetchClassBadgeLeaderboard(
  classId: string
): Promise<BadgeLeaderboardEntry[]> {
  // Get all students in class
  const { data: students, error: studentError } = await supabase
    .from("students")
    .select(
      `
      id,
      user_id,
      tenant_id,
      profile:user_id (
        id,
        first_name,
        last_name,
        avatar_url
      )
    `
    )
    .eq("class_id", classId);

  if (studentError || !students) {
    console.error("Error fetching students:", studentError);
    return [];
  }

  const leaderboard: BadgeLeaderboardEntry[] = [];

  for (const student of students) {
    if (!student.user_id) continue;

    try {
      // Get badges for this student
      const { data: badges } = await supabase
        .from("user_badges")
        .select(
          `
          id,
          earned_date,
          badge:badge_definition_id (
            badge_type,
            rarity
          )
        `
        )
        .eq("user_id", student.user_id)
        .eq("tenant_id", student.tenant_id);

      // Calculate stats
      const badgesByType = {
        performance: 0,
        achievement: 0,
        certification: 0,
        attendance: 0,
        participation: 0,
      };

      if (badges) {
        for (const b of badges) {
          if (b.badge?.badge_type) {
            badgesByType[b.badge.badge_type as any]++;
          }
        }
      }

      leaderboard.push({
        userId: student.user_id,
        userName: `${student.profile?.first_name} ${student.profile?.last_name}`,
        avatar: student.profile?.avatar_url || undefined,
        totalBadges: badges?.length || 0,
        badgesByType,
        recentBadges: [], // Optional: could fetch if needed
      });
    } catch (error) {
      console.error(`Error processing student ${student.user_id}:`, error);
    }
  }

  // Sort by total badges descending
  return leaderboard
    .sort((a, b) => b.totalBadges - a.totalBadges)
    .map((entry, idx) => ({ ...entry, rank: idx + 1 }));
}

// =====================================================================
// API: GET /api/badges/check-unlocks/:userId
// Check which badges a user is eligible to unlock
// =====================================================================
export async function checkEligibleBadges(userId: string, tenantId: string) {
  const userBadges = await fetchUserBadges(userId, tenantId);
  const allBadges = await fetchBadgeDefinitions(tenantId);

  const unlockedIds = new Set(userBadges.map((b) => b.badge_definition_id));
  const eligible = allBadges.filter((b) => !unlockedIds.has(b.id));

  return {
    eligible,
    locked: eligible.length,
    unlocked: userBadges.length,
    total: allBadges.length,
  };
}

// =====================================================================
// REALTIME SUBSCRIPTIONS
// =====================================================================

/**
 * Subscribe to badge unlock events for a user
 */
export function subscribeToBadgeUnlocks(
  userId: string,
  tenantId: string,
  onBadgeUnlocked: (badge: BadgeNotification) => void
) {
  const subscription = supabase
    .from(`user_badges:user_id=eq.${userId}`)
    .on("*", (payload) => {
      if (payload.eventType === "INSERT") {
        const newBadge = payload.new;
        onBadgeUnlocked({
          id: newBadge.id,
          userId,
          badgeId: newBadge.badge_definition_id,
          badgeName: "New Badge", // Would be populated from badge definition
          message: "You just earned a new badge!",
          timestamp: new Date(),
          seen: false,
        });
      }
    })
    .subscribe();

  return subscription;
}

/**
 * Subscribe to badge stats for realtime updates
 */
export function subscribeToBadgeStats(
  userId: string,
  tenantId: string,
  onStatsUpdate: (stats: any) => void
) {
  const subscription = supabase
    .from(`user_badges:user_id=eq.${userId}`)
    .on("*", async () => {
      // Recalculate stats on any change
      const stats = await fetchUserBadgeStats(userId, tenantId);
      onStatsUpdate(stats);
    })
    .subscribe();

  return subscription;
}

// =====================================================================
// NOTIFICATION SYSTEM
// =====================================================================

/**
 * Notify user of badge unlock (toast + optional email)
 */
export async function notifyBadgeUnlock(
  userId: string,
  badgeName: string,
  badgeId: string,
  sendEmail: boolean = false
): Promise<void> {
  try {
    // Store notification in database
    const { error } = await supabase
      .from("badge_unlock_logs")
      .insert({
        user_id: userId,
        badge_definition_id: badgeId,
        event_type: "notification_sent",
        event_data: {
          sendEmail,
          timestamp: new Date().toISOString(),
        },
      });

    if (error) console.error("Error logging notification:", error);

    // Could send email here via edge functions
    if (sendEmail) {
      // await sendBadgeUnlockEmail(userId, badgeName);
    }
  } catch (error) {
    console.error("Error notifying badge unlock:", error);
  }
}

// =====================================================================
// ADMIN OPERATIONS
// =====================================================================

/**
 * Create a new badge definition (admin only)
 */
export async function createBadgeDefinition(
  tenantId: string,
  badgeData: any
): Promise<any> {
  const { data, error } = await supabase
    .from("badges_definitions")
    .insert({
      tenant_id: tenantId,
      ...badgeData,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a badge definition (admin only)
 */
export async function updateBadgeDefinition(badgeId: string, updates: any): Promise<any> {
  const { data, error } = await supabase
    .from("badges_definitions")
    .update(updates)
    .eq("id", badgeId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a badge definition (admin only)
 */
export async function deleteBadgeDefinition(badgeId: string): Promise<void> {
  const { error } = await supabase
    .from("badges_definitions")
    .delete()
    .eq("id", badgeId);

  if (error) throw error;
}

/**
 * Revoke a badge from a user (admin only)
 */
export async function revokeBadge(userBadgeId: string): Promise<void> {
  const { error } = await supabase
    .from("user_badges")
    .delete()
    .eq("id", userBadgeId);

  if (error) throw error;
}

// =====================================================================
// BATCH OPERATIONS
// =====================================================================

/**
 * Bulk award badges to users based on criteria
 */
export async function bulkAwardBadges(
  tenantId: string,
  badgeDefinitionId: string,
  userIds: string[],
  eventType: string = "bulk_award"
): Promise<{ success: number; failed: number }> {
  let successCount = 0;
  let failedCount = 0;

  for (const userId of userIds) {
    try {
      const result = await awardBadge(userId, tenantId, badgeDefinitionId, eventType);
      if (result.success) {
        successCount++;
      } else {
        failedCount++;
      }
    } catch (error) {
      console.error(`Failed to award badge to ${userId}:`, error);
      failedCount++;
    }
  }

  return { success: successCount, failed: failedCount };
}

/**
 * Export user badges as data
 */
export async function exportUserBadges(userId: string, tenantId: string) {
  const badges = await fetchUserBadges(userId, tenantId);
  const stats = await fetchUserBadgeStats(userId, tenantId);

  return {
    userId,
    exportDate: new Date().toISOString(),
    totalBadges: stats.totalBadges,
    badges: badges.map((b) => ({
      id: b.id,
      name: b.badge?.name,
      type: b.badge?.badge_type,
      earnedDate: b.earned_date,
      rarity: b.badge?.rarity,
    })),
    statistics: stats,
  };
}
