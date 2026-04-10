/**
 * Badge System Types
 * Comprehensive TypeScript interfaces for badge functionality
 */

// =====================================================================
// BADGE TYPE ENUMS
// =====================================================================

export enum BadgeType {
  PERFORMANCE = "performance",
  ACHIEVEMENT = "achievement",
  CERTIFICATION = "certification",
  ATTENDANCE = "attendance",
  PARTICIPATION = "participation",
}

export enum BadgeTemplate {
  CIRCLE = "circle",
  RIBBON = "ribbon",
  THREE_D = "3d",
  MINIMALIST = "minimalist",
  ANIMATED = "animated",
}

export enum BadgeRarity {
  COMMON = "common",
  UNCOMMON = "uncommon",
  RARE = "rare",
  EPIC = "epic",
  LEGENDARY = "legendary",
}

// =====================================================================
// COLOR SCHEMES BY TYPE AND TEMPLATE
// =====================================================================

export const BADGE_COLOR_SCHEMES: Record<BadgeType, { primary: string; secondary: string }> = {
  [BadgeType.PERFORMANCE]: {
    primary: "#ef4444", // Red-500
    secondary: "#fbbf24", // Amber-400
  },
  [BadgeType.ACHIEVEMENT]: {
    primary: "#3b82f6", // Blue-500
    secondary: "#93c5fd", // Blue-300
  },
  [BadgeType.CERTIFICATION]: {
    primary: "#10b981", // Green-500
    secondary: "#d1fae5", // Green-100
  },
  [BadgeType.ATTENDANCE]: {
    primary: "#a855f7", // Purple-500
    secondary: "#f3e8ff", // Purple-100
  },
  [BadgeType.PARTICIPATION]: {
    primary: "#f97316", // Orange-500
    secondary: "#fed7aa", // Orange-200
  },
};

// =====================================================================
// BADGE DEFINITIONS
// =====================================================================

export interface BadgeDefinition {
  id: string;
  tenant_id: string;
  badge_type: BadgeType;
  badge_template: BadgeTemplate;
  name: string;
  description: string | null;
  icon_url: string | null;
  color_primary: string;
  color_secondary: string;
  rarity: BadgeRarity;
  requirements: BadgeRequirements;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface BadgeRequirements {
  [key: string]: number | string | boolean | object;
}

// =====================================================================
// USER BADGES
// =====================================================================

export interface UserBadge {
  id: string;
  tenant_id: string;
  user_id: string;
  badge_definition_id: string;
  earned_date: string;
  seen: boolean;
  shared: boolean;
  created_at: string;
  updated_at: string;
  // Joined data
  badge?: BadgeDefinition;
}

export interface UserBadgeWithDetails extends UserBadge {
  badge: BadgeDefinition;
}

// =====================================================================
// BADGE UNLOCK LOGS
// =====================================================================

export interface BadgeUnlockLog {
  id: string;
  tenant_id: string;
  user_id: string;
  badge_definition_id: string;
  event_type: string;
  event_data: Record<string, any>;
  created_at: string;
}

// =====================================================================
// BADGE DISPLAY PROPS
// =====================================================================

export interface BadgeDisplayProps {
  badge: BadgeDefinition;
  size?: "sm" | "md" | "lg" | "xl";
  showName?: boolean;
  showDescription?: boolean;
  onClick?: () => void;
  className?: string;
}

export interface BadgeCardProps {
  badge: BadgeDefinition;
  userBadge?: UserBadge;
  isNew?: boolean;
  onShare?: () => void;
  onLearnMore?: () => void;
  className?: string;
}

export interface BadgeGridProps {
  badges: UserBadgeWithDetails[];
  filterType?: BadgeType | null;
  filterTemplate?: BadgeTemplate | null;
  sortBy?: "date" | "rarity" | "name";
  isLoading?: boolean;
  emptyState?: React.ReactNode;
  className?: string;
}

// =====================================================================
// BADGE STATISTICS
// =====================================================================

export interface BadgeStats {
  totalBadges: number;
  badgesByType: Record<BadgeType, number>;
  badgesByTemplate: Record<BadgeTemplate, number>;
  badgesByRarity: Record<BadgeRarity, number>;
  recentBadges: UserBadgeWithDetails[];
  nextMilestones: BadgeDefinition[];
}

// =====================================================================
// BADGE UNLOCK EVENTS
// =====================================================================

export enum BadgeUnlockEventType {
  GRADE_POSTED = "grade_posted",
  AVERAGE_HIGH = "average_high",
  PERFECT_SCORE = "perfect_score",
  IMPROVEMENT = "improvement",
  ATTENDANCE_PERFECT = "attendance_perfect",
  ATTENDANCE_GOOD = "attendance_good",
  PROJECT_COMPLETED = "project_completed",
  DISCUSSION_LED = "discussion_led",
  PEER_HELPED = "peer_helped",
  STREAK_ACHIEVED = "streak_achieved",
}

export interface BadgeUnlockEvent {
  eventType: BadgeUnlockEventType;
  userId: string;
  tenantId: string;
  eventData: Record<string, any>;
  timestamp?: Date;
}

// =====================================================================
// BADGE SERVICE RESPONSES
// =====================================================================

export interface BadgeUnlockResult {
  success: boolean;
  badgeId?: string;
  badgeName?: string;
  message: string;
  isNew: boolean;
}

export interface BadgeCheckResult {
  eligibleBadges: BadgeDefinition[];
  unlockableNow: string[]; // badge IDs
  upcoming: string[]; // badge IDs the user is close to earning
}

// =====================================================================
// LEADERBOARD
// =====================================================================

export interface BadgeLeaderboardEntry {
  userId: string;
  userName: string;
  avatar?: string;
  totalBadges: number;
  badgesByType: Record<BadgeType, number>;
  recentBadges: UserBadgeWithDetails[];
  rank?: number;
}

// =====================================================================
// BADGE TEMPLATE RENDERING CONFIGS
// =====================================================================

export interface BadgeTemplateConfig {
  template: BadgeTemplate;
  renderFn: (badge: BadgeDefinition, size: string) => React.ReactNode;
  supportsAnimation: boolean;
  aspectRatio: "square" | "circle";
}

// =====================================================================
// ADMIN MANAGEMENT
// =====================================================================

export interface CreateBadgeInput {
  badge_type: BadgeType;
  badge_template: BadgeTemplate;
  name: string;
  description?: string;
  icon_url?: string;
  color_primary?: string;
  color_secondary?: string;
  rarity?: BadgeRarity;
  requirements: BadgeRequirements;
  sort_order?: number;
}

export interface UpdateBadgeInput extends Partial<CreateBadgeInput> {
  id: string;
}

// =====================================================================
// NOTIFICATION
// =====================================================================

export interface BadgeNotification {
  id: string;
  userId: string;
  badgeId: string;
  badgeName: string;
  message: string;
  timestamp: Date;
  seen: boolean;
  actionUrl?: string;
}
