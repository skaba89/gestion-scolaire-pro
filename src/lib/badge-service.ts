/**
 * Badge Service
 * Core business logic for badge management and unlock logic
 */

import { apiClient } from "@/api/client";
import {
  BadgeDefinition,
  BadgeType,
  UserBadge,
  BadgeUnlockResult,
  BadgeCheckResult,
  UserBadgeWithDetails,
  BadgeStats,
  BadgeUnlockEventType,
  BadgeLeaderboardEntry,
} from "@/lib/badges-types";

// =====================================================================
// BADGE RETRIEVAL
// =====================================================================

/**
 * Get all badge definitions for a tenant
 */
export async function getBadgeDefinitions(
  tenantId: string,
  activeOnly = true
): Promise<BadgeDefinition[]> {
  const params: Record<string, string> = { tenant_id: tenantId };
  if (activeOnly) params.is_active = "true";

  const { data } = await apiClient.get<BadgeDefinition[]>("/school-life/badges/definitions/", { params });
  return data || [];
}

/**
 * Get all badges earned by a user
 */
export async function getUserBadges(
  userId: string,
  tenantId: string
): Promise<UserBadgeWithDetails[]> {
  const { data } = await apiClient.get<UserBadgeWithDetails[]>("/school-life/badges/", {
    params: { user_id: userId, tenant_id: tenantId },
  });
  return (data || []) as UserBadgeWithDetails[];
}

/**
 * Get a specific badge
 */
export async function getBadge(badgeId: string): Promise<BadgeDefinition | null> {
  try {
    const { data } = await apiClient.get<BadgeDefinition>(`/school-life/badges/definitions/${badgeId}/`);
    return data;
  } catch {
    return null;
  }
}

// =====================================================================
// BADGE UNLOCK LOGIC
// =====================================================================

/**
 * Check if a user should unlock a specific badge
 */
export async function checkBadgeUnlock(
  userId: string,
  tenantId: string,
  badgeDefinitionId: string
): Promise<boolean> {
  const badge = await getBadge(badgeDefinitionId);
  if (!badge) return false;

  switch (badge.badge_type) {
    case BadgeType.PERFORMANCE:
      return await checkPerformanceBadge(userId, tenantId, badge);
    case BadgeType.ACHIEVEMENT:
      return await checkAchievementBadge(userId, tenantId, badge);
    case BadgeType.ATTENDANCE:
      return await checkAttendanceBadge(userId, tenantId, badge);
    case BadgeType.PARTICIPATION:
      return await checkParticipationBadge(userId, tenantId, badge);
    case BadgeType.CERTIFICATION:
      return await checkCertificationBadge(userId, tenantId, badge);
    default:
      return false;
  }
}

/**
 * Check performance badge requirements
 */
async function checkPerformanceBadge(
  userId: string,
  tenantId: string,
  badge: BadgeDefinition
): Promise<boolean> {
  const { min_average, min_score, improvement_threshold } =
    badge.requirements as any;

  try {
    const { data: student } = await apiClient.get<any>("/students/", {
      params: { user_id: userId, tenant_id: tenantId, limit: "1" },
    });
    if (!student?.[0]?.id) return false;
    const studentId = student[0].id;

    if (min_average) {
      const { data: grades } = await apiClient.get<any[]>("/grades/", {
        params: { student_id: studentId },
      });
      if (!grades || grades.length === 0) return false;
      const average = grades.reduce((sum: number, g: any) => sum + (g.score || 0), 0) / grades.length;
      return average >= min_average;
    }

    if (min_score) {
      const { data: grades } = await apiClient.get<any[]>("/grades/", {
        params: { student_id: studentId, min_score: String(min_score), limit: "1" },
      });
      return (grades?.length || 0) > 0;
    }

    if (improvement_threshold) {
      const { data: grades } = await apiClient.get<any[]>("/grades/", {
        params: { student_id: studentId, limit: "20" },
      });
      if (!grades || grades.length < 2) return false;
      const latest = grades[0].score || 0;
      const previous = grades[grades.length - 1].score || 0;
      return latest - previous >= improvement_threshold;
    }
  } catch { /* fallback */ }
  return false;
}

/**
 * Check achievement badge requirements
 */
async function checkAchievementBadge(
  userId: string,
  tenantId: string,
  badge: BadgeDefinition
): Promise<boolean> {
  const { score, consecutive_days } = badge.requirements as any;

  try {
    const { data: student } = await apiClient.get<any>("/students/", {
      params: { user_id: userId, tenant_id: tenantId, limit: "1" },
    });
    if (!student?.[0]?.id) return false;
    const studentId = student[0].id;

    if (score === 100) {
      const { data: grades } = await apiClient.get<any[]>("/grades/", {
        params: { student_id: studentId, score: "100", limit: "1" },
      });
      return (grades?.length || 0) > 0;
    }

    if (consecutive_days) {
      const since = new Date(Date.now() - consecutive_days * 24 * 60 * 60 * 1000).toISOString();
      const { data: attendance } = await apiClient.get<any[]>("/attendance/", {
        params: { student_id: studentId, status: "PRESENT", since },
      });
      return (attendance?.length || 0) >= consecutive_days;
    }
  } catch { /* fallback */ }
  return false;
}

/**
 * Check attendance badge requirements
 */
async function checkAttendanceBadge(
  userId: string,
  tenantId: string,
  badge: BadgeDefinition
): Promise<boolean> {
  const { absences, tardies, absence_rate } = badge.requirements as any;

  try {
    const { data: student } = await apiClient.get<any>("/students/", {
      params: { user_id: userId, tenant_id: tenantId, limit: "1" },
    });
    if (!student?.[0]?.id) return false;
    const studentId = student[0].id;

    const { data: attendance } = await apiClient.get<any[]>("/attendance/", {
      params: { student_id: studentId },
    });
    if (!attendance) return false;

    if (absences === 0 && tardies === 0) {
      return !attendance.some((a: any) => a.status !== "PRESENT");
    }

    if (absence_rate) {
      const absentCount = attendance.filter((a: any) => a.status === "ABSENT").length;
      const rate = absentCount / attendance.length;
      return rate <= absence_rate;
    }
  } catch { /* fallback */ }
  return false;
}

/**
 * Check participation badge requirements
 */
async function checkParticipationBadge(
  _userId: string,
  _tenantId: string,
  _badge: BadgeDefinition
): Promise<boolean> {
  return false;
}

/**
 * Check certification badge requirements
 */
async function checkCertificationBadge(
  _userId: string,
  _tenantId: string,
  _badge: BadgeDefinition
): Promise<boolean> {
  return false;
}

// =====================================================================
// BADGE UNLOCK OPERATIONS
// =====================================================================

/**
 * Award a badge to a user
 */
export async function unlockBadge(
  userId: string,
  tenantId: string,
  badgeDefinitionId: string,
  eventType: string = "manual"
): Promise<BadgeUnlockResult> {
  try {
    // Check if already unlocked
    const { data: existing } = await apiClient.get<any[]>("/school-life/badges/", {
      params: { user_id: userId, tenant_id: tenantId, badge_definition_id: badgeDefinitionId, limit: "1" },
    });

    if (existing && existing.length > 0) {
      return { success: false, message: "Badge already unlocked", isNew: false };
    }

    // Insert badge
    const { data: newBadge } = await apiClient.post<any>("/school-life/badges/", {
      tenant_id: tenantId,
      user_id: userId,
      badge_definition_id: badgeDefinitionId,
      earned_date: new Date().toISOString(),
    });

    // Log the unlock
    await apiClient.post("/school-life/badges/unlock-logs/", {
      tenant_id: tenantId,
      user_id: userId,
      badge_definition_id: badgeDefinitionId,
      event_type: eventType,
      event_data: {},
    });

    const badge = await getBadge(badgeDefinitionId);

    return {
      success: true,
      badgeId: newBadge?.id,
      badgeName: badge?.name || "Unknown Badge",
      message: `Congratulations! You unlocked "${badge?.name}"!`,
      isNew: true,
    };
  } catch (error) {
    console.error("Error unlocking badge:", error);
    return { success: false, message: "Failed to unlock badge", isNew: false };
  }
}

/**
 * Mark badges as seen by user
 */
export async function markBadgeAsSeen(badgeId: string): Promise<void> {
  await apiClient.patch(`/school-life/badges/${badgeId}/`, { seen: true });
}

/**
 * Toggle badge sharing status
 */
export async function toggleBadgeShare(badgeId: string, shared: boolean): Promise<void> {
  await apiClient.patch(`/school-life/badges/${badgeId}/`, { shared });
}

// =====================================================================
// BADGE STATISTICS
// =====================================================================

/**
 * Get badge statistics for a user
 */
export async function getUserBadgeStats(
  userId: string,
  tenantId: string
): Promise<BadgeStats> {
  const userBadges = await getUserBadges(userId, tenantId);
  const allBadges = await getBadgeDefinitions(tenantId);

  const stats: BadgeStats = {
    totalBadges: userBadges.length,
    badgesByType: {
      [BadgeType.PERFORMANCE]: 0,
      [BadgeType.ACHIEVEMENT]: 0,
      [BadgeType.CERTIFICATION]: 0,
      [BadgeType.ATTENDANCE]: 0,
      [BadgeType.PARTICIPATION]: 0,
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
      stats.badgesByType[badge.badge.badge_type as BadgeType]++;
      stats.badgesByTemplate[badge.badge.badge_template as any]++;
      stats.badgesByRarity[badge.badge.rarity as any]++;
    }
  }

  return stats;
}

/**
 * Get leaderboard for a class
 */
export async function getClassBadgeLeaderboard(
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

// =====================================================================
// BADGE REQUIREMENTS CHECKING
// =====================================================================

/**
 * Check all possible badge unlocks for a user
 */
export async function checkAllBadgeUnlocks(
  userId: string,
  tenantId: string
): Promise<BadgeCheckResult> {
  const allBadges = await getBadgeDefinitions(tenantId);
  const userBadges = await getUserBadges(userId, tenantId);
  const unlockedIds = new Set(userBadges.map((b) => b.badge_definition_id));

  const eligibleBadges = allBadges.filter((b) => !unlockedIds.has(b.id));
  const unlockableNow: string[] = [];
  const upcoming: string[] = [];

  for (const badge of eligibleBadges) {
    const canUnlock = await checkBadgeUnlock(userId, tenantId, badge.id);
    if (canUnlock) {
      unlockableNow.push(badge.id);
    } else {
      upcoming.push(badge.id);
    }
  }

  return { eligibleBadges, unlockableNow, upcoming };
}
