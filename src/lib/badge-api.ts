/**
 * Badge API Routes and Backend Logic
 * Handles all badge-related operations: unlock, stats, notifications, leaderboard
 */

import { apiClient } from "@/api/client";
import {
  BadgeUnlockResult,
  BadgeNotification,
  BadgeLeaderboardEntry,
} from "@/lib/badges-types";

export async function fetchBadgeDefinitions(tenantId: string) {
  const { data } = await apiClient.get<any[]>("/school-life/badges/definitions/", {
    params: { tenant_id: tenantId, is_active: "true" },
  });
  return data;
}

export async function fetchUserBadges(userId: string, tenantId: string) {
  const { data } = await apiClient.get<any[]>("/school-life/badges/", {
    params: { user_id: userId, tenant_id: tenantId },
  });
  return data;
}

export async function awardBadge(
  userId: string,
  tenantId: string,
  badgeDefinitionId: string,
  eventType: string = "manual"
): Promise<BadgeUnlockResult> {
  try {
    const { data: existing } = await apiClient.get<any[]>("/school-life/badges/", {
      params: { user_id: userId, tenant_id: tenantId, badge_definition_id: badgeDefinitionId, limit: "1" },
    });

    if (existing && existing.length > 0) {
      return { success: false, message: "Badge already unlocked by this user", isNew: false };
    }

    const { data: newBadge } = await apiClient.post<any>("/school-life/badges/", {
      tenant_id: tenantId,
      user_id: userId,
      badge_definition_id: badgeDefinitionId,
      earned_date: new Date().toISOString(),
      seen: false,
      shared: false,
    });

    await apiClient.post("/school-life/badges/unlock-logs/", {
      tenant_id: tenantId,
      user_id: userId,
      badge_definition_id: badgeDefinitionId,
      event_type: eventType,
      event_data: { timestamp: new Date().toISOString() },
    });

    const { data: badge } = await apiClient.get<any>(`/school-life/badges/definitions/${badgeDefinitionId}/`);

    return {
      success: true,
      badgeId: newBadge?.id,
      badgeName: badge?.name || "Unknown Badge",
      message: `🎉 Congratulations! You unlocked "${badge?.name}"!`,
      isNew: true,
    };
  } catch (error) {
    console.error("Error awarding badge:", error);
    return { success: false, message: "Failed to unlock badge", isNew: false };
  }
}

export async function markBadgeAsSeen(badgeId: string): Promise<void> {
  await apiClient.patch(`/school-life/badges/${badgeId}/`, { seen: true });
}

export async function toggleBadgeShare(badgeId: string, shared: boolean): Promise<void> {
  await apiClient.patch(`/school-life/badges/${badgeId}/`, { shared });
}

export async function fetchUserBadgeStats(userId: string, tenantId: string) {
  const userBadges = await fetchUserBadges(userId, tenantId);
  const allBadges = await fetchBadgeDefinitions(tenantId);

  const stats: any = {
    totalBadges: userBadges.length,
    badgesByType: { performance: 0, achievement: 0, certification: 0, attendance: 0, participation: 0 },
    badgesByTemplate: { circle: 0, ribbon: 0, "3d": 0, minimalist: 0, animated: 0 },
    badgesByRarity: { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 },
    recentBadges: userBadges.slice(0, 3),
    nextMilestones: allBadges.filter((b: any) => !userBadges.find((ub: any) => ub.badge_definition_id === b.id)),
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

export async function fetchClassBadgeLeaderboard(
  classId: string
): Promise<BadgeLeaderboardEntry[]> {
  try {
    const { data } = await apiClient.get<BadgeLeaderboardEntry[]>("/school-life/badges/leaderboard/", {
      params: { class_id: classId },
    });
    return data || [];
  } catch {
    return [];
  }
}

export async function checkEligibleBadges(userId: string, tenantId: string) {
  const userBadges = await fetchUserBadges(userId, tenantId);
  const allBadges = await fetchBadgeDefinitions(tenantId);

  const unlockedIds = new Set(userBadges.map((b: any) => b.badge_definition_id));
  const eligible = allBadges.filter((b: any) => !unlockedIds.has(b.id));

  return { eligible, locked: eligible.length, unlocked: userBadges.length, total: allBadges.length };
}

// Realtime subscriptions - stub for API-based architecture
export function subscribeToBadgeUnlocks(
  _userId: string,
  _tenantId: string,
  _onBadgeUnlocked: (badge: BadgeNotification) => void
) {
  console.warn("Realtime badge subscriptions require WebSocket. Use polling instead.");
  return { unsubscribe: () => {} };
}

export function subscribeToBadgeStats(
  _userId: string,
  _tenantId: string,
  _onStatsUpdate: (stats: any) => void
) {
  console.warn("Realtime badge stats require WebSocket. Use polling instead.");
  return { unsubscribe: () => {} };
}

export async function notifyBadgeUnlock(
  userId: string,
  _badgeName: string,
  badgeId: string,
  _sendEmail: boolean = false
): Promise<void> {
  try {
    await apiClient.post("/school-life/badges/unlock-logs/", {
      user_id: userId,
      badge_definition_id: badgeId,
      event_type: "notification_sent",
      event_data: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    console.error("Error notifying badge unlock:", error);
  }
}

export async function createBadgeDefinition(tenantId: string, badgeData: any): Promise<any> {
  const { data } = await apiClient.post("/school-life/badges/definitions/", { tenant_id: tenantId, ...badgeData });
  return data;
}

export async function updateBadgeDefinition(badgeId: string, updates: any): Promise<any> {
  const { data } = await apiClient.patch(`/school-life/badges/definitions/${badgeId}/`, updates);
  return data;
}

export async function deleteBadgeDefinition(badgeId: string): Promise<void> {
  await apiClient.delete(`/school-life/badges/definitions/${badgeId}/`);
}

export async function revokeBadge(userBadgeId: string): Promise<void> {
  await apiClient.delete(`/school-life/badges/${userBadgeId}/`);
}

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
      if (result.success) successCount++;
      else failedCount++;
    } catch {
      failedCount++;
    }
  }

  return { success: successCount, failed: failedCount };
}

export async function exportUserBadges(userId: string, tenantId: string) {
  const badges = await fetchUserBadges(userId, tenantId);
  const stats = await fetchUserBadgeStats(userId, tenantId);

  return {
    userId,
    exportDate: new Date().toISOString(),
    totalBadges: stats.totalBadges,
    badges: badges.map((b: any) => ({
      id: b.id, name: b.badge?.name, type: b.badge?.badge_type,
      earnedDate: b.earned_date, rarity: b.badge?.rarity,
    })),
    statistics: stats,
  };
}
