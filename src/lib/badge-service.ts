/**
 * Badge Service
 * Core business logic for badge management and unlock logic
 */

import { supabase } from "@/integrations/supabase/client";
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
  let query = supabase
    .from("badges_definitions")
    .select("*")
    .eq("tenant_id", tenantId);

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query.order("sort_order", { ascending: true });

  if (error) {
    console.error("Error fetching badge definitions:", error);
    throw error;
  }

  return data || [];
}

/**
 * Get all badges earned by a user
 */
export async function getUserBadges(
  userId: string,
  tenantId: string
): Promise<UserBadgeWithDetails[]> {
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

  if (error) {
    console.error("Error fetching user badges:", error);
    throw error;
  }

  return (data || []) as UserBadgeWithDetails[];
}

/**
 * Get a specific badge
 */
export async function getBadge(badgeId: string): Promise<BadgeDefinition | null> {
  const { data, error } = await supabase
    .from("badges_definitions")
    .select("*")
    .eq("id", badgeId)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Error fetching badge:", error);
    throw error;
  }

  return data;
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
  const { min_average, min_score, improvement_threshold, applies_to } =
    badge.requirements as any;

  // Get student ID from user
  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (!student) return false;

  if (min_average) {
    // Check average across subject or all
    const { data: grades } = await supabase
      .from("grades")
      .select("score")
      .eq("student_id", student.id);

    if (!grades || grades.length === 0) return false;

    const average =
      grades.reduce((sum, g) => sum + (g.score || 0), 0) / grades.length;
    return average >= min_average;
  }

  if (min_score) {
    // Check if any score >= min_score
    const { data: grades } = await supabase
      .from("grades")
      .select("score")
      .eq("student_id", student.id)
      .gte("score", min_score)
      .limit(1);

    return (grades?.length || 0) > 0;
  }

  if (improvement_threshold) {
    // Check for recent improvement
    const { data: grades } = await supabase
      .from("grades")
      .select("score, created_at")
      .eq("student_id", student.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!grades || grades.length < 2) return false;

    const latest = grades[0].score || 0;
    const previous = grades[grades.length - 1].score || 0;
    return latest - previous >= improvement_threshold;
  }

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
  const { score, consecutive_days, project_type, leadership_role, retake } =
    badge.requirements as any;

  // Get student ID
  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (!student) return false;

  if (score === 100) {
    // Check for perfect score
    const { data: grades } = await supabase
      .from("grades")
      .select("score")
      .eq("student_id", student.id)
      .eq("score", 100)
      .limit(1);

    return (grades?.length || 0) > 0;
  }

  if (consecutive_days) {
    // Check for streak
    // Simplified: just check if they have enough present days
    const { data: attendance } = await supabase
      .from("attendance")
      .select("date, status")
      .eq("student_id", student.id)
      .eq("status", "PRESENT")
      .gte("date", new Date(Date.now() - consecutive_days * 24 * 60 * 60 * 1000).toISOString());

    return (attendance?.length || 0) >= consecutive_days;
  }

  if (leadership_role) {
    // Admin can grant this
    return false;
  }

  if (retake) {
    // Check for retake improvement
    const { data: gradeHistory } = await supabase
      .from("grades")
      .select("score, subject_id")
      .eq("student_id", student.id)
      .order("created_at", { ascending: true });

    if (!gradeHistory || gradeHistory.length < 2) return false;

    // Check if any subject has improvement on retake
    const subjectGrades: Record<string, number[]> = {};
    for (const g of gradeHistory) {
      if (!subjectGrades[g.subject_id]) {
        subjectGrades[g.subject_id] = [];
      }
      subjectGrades[g.subject_id].push(g.score || 0);
    }

    return Object.values(subjectGrades).some(
      (grades) => grades.length > 1 && grades[grades.length - 1] > grades[0]
    );
  }

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
  const { absences, tardies, absence_rate, exam_attendance_rate } =
    badge.requirements as any;

  // Get student ID
  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (!student) return false;

  const { data: attendance } = await supabase
    .from("attendance")
    .select("status");

  if (!attendance) return false;

  if (absences === 0 && tardies === 0) {
    // Perfect attendance
    return !attendance.some((a) => a.status !== "PRESENT");
  }

  if (absence_rate) {
    // Calculate absence rate
    const absentCount = attendance.filter((a) => a.status === "ABSENT").length;
    const rate = absentCount / attendance.length;
    return rate <= absence_rate;
  }

  return false;
}

/**
 * Check participation badge requirements
 */
async function checkParticipationBadge(
  userId: string,
  tenantId: string,
  badge: BadgeDefinition
): Promise<boolean> {
  const { contributions, discussions_led, students_helped, organized_activity } =
    badge.requirements as any;

  // These would typically be tracked in a separate participation table
  // For now, return false and let admins grant manually
  return false;
}

/**
 * Check certification badge requirements
 */
async function checkCertificationBadge(
  userId: string,
  tenantId: string,
  badge: BadgeDefinition
): Promise<boolean> {
  // These are typically awarded by admin or on course completion
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
    const { data: existing } = await supabase
      .from("user_badges")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("badge_definition_id", badgeDefinitionId)
      .single();

    if (existing) {
      return {
        success: false,
        message: "Badge already unlocked",
        isNew: false,
      };
    }

    // Insert badge
    const { data: newBadge, error } = await supabase
      .from("user_badges")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        badge_definition_id: badgeDefinitionId,
        earned_date: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Log the unlock
    await supabase.from("badge_unlock_logs").insert({
      tenant_id: tenantId,
      user_id: userId,
      badge_definition_id: badgeDefinitionId,
      event_type: eventType,
      event_data: {},
    });

    // Get badge details for notification
    const badge = await getBadge(badgeDefinitionId);

    return {
      success: true,
      badgeId: newBadge.id,
      badgeName: badge?.name || "Unknown Badge",
      message: `Congratulations! You unlocked "${badge?.name}"!`,
      isNew: true,
    };
  } catch (error) {
    console.error("Error unlocking badge:", error);
    return {
      success: false,
      message: "Failed to unlock badge",
      isNew: false,
    };
  }
}

/**
 * Mark badges as seen by user
 */
export async function markBadgeAsSeen(badgeId: string): Promise<void> {
  await supabase
    .from("user_badges")
    .update({ seen: true })
    .eq("id", badgeId);
}

/**
 * Toggle badge sharing status
 */
export async function toggleBadgeShare(badgeId: string, shared: boolean): Promise<void> {
  await supabase
    .from("user_badges")
    .update({ shared })
    .eq("id", badgeId);
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
  // Get all students in class
  const { data: students } = await supabase
    .from("students")
    .select("id, user_id, user:user_id(id)")
    .eq("class_id", classId);

  if (!students) return [];

  const leaderboard: BadgeLeaderboardEntry[] = [];

  for (const student of students) {
    if (!student.user_id) continue;

    // Get tenant from student
    const { data: studentData } = await supabase
      .from("students")
      .select("tenant_id")
      .eq("id", student.id)
      .single();

    if (!studentData) continue;

    const stats = await getUserBadgeStats(student.user_id, studentData.tenant_id);

    leaderboard.push({
      userId: student.user_id,
      userName: "Student", // Would need profile join
      totalBadges: stats.totalBadges,
      badgesByType: stats.badgesByType,
      recentBadges: stats.recentBadges,
    });
  }

  // Sort by total badges descending
  return leaderboard
    .sort((a, b) => b.totalBadges - a.totalBadges)
    .map((entry, idx) => ({ ...entry, rank: idx + 1 }));
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
