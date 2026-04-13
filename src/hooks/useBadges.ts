/**
 * React Hooks for Badge System
 * Custom hooks for fetching, managing, and tracking badge data
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchBadgeDefinitions,
  fetchUserBadges,
  fetchUserBadgeStats,
  awardBadge,
  markBadgeAsSeen,
  toggleBadgeShare,
  fetchClassBadgeLeaderboard,
  checkEligibleBadges,
} from "@/lib/badge-api";
import {
  initializeBadgeNotifications,
  playNotificationSound,
  triggerHapticFeedback,
} from "@/lib/badge-notification-service";
import { BadgeNotification } from "@/lib/badges-types";

// =====================================================================
// HOOK: useUserBadges
// Fetch all badges earned by current user
// =====================================================================
export function useUserBadges() {
  const { user } = useAuth();
  const { currentTenant } = useTenant();

  return useQuery({
    queryKey: ["user-badges", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!user?.id || !currentTenant?.id) {
        return [];
      }
      return fetchUserBadges(user.id, currentTenant.id);
    },
    enabled: !!user?.id && !!currentTenant?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// =====================================================================
// HOOK: useBadgeDefinitions
// Fetch all available badge definitions for tenant
// =====================================================================
export function useBadgeDefinitions() {
  const { currentTenant } = useTenant();

  return useQuery({
    queryKey: ["badge-definitions", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant?.id) {
        return [];
      }
      return fetchBadgeDefinitions(currentTenant.id);
    },
    enabled: !!currentTenant?.id,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}

// =====================================================================
// HOOK: useBadgeStats
// Fetch badge statistics for current user
// =====================================================================
export function useBadgeStats() {
  const { user } = useAuth();
  const { currentTenant } = useTenant();

  return useQuery({
    queryKey: ["badge-stats", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!user?.id || !currentTenant?.id) {
        return null;
      }
      return fetchUserBadgeStats(user.id, currentTenant.id);
    },
    enabled: !!user?.id && !!currentTenant?.id,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

// =====================================================================
// HOOK: useAwardBadge
// Mutation to award a badge to a user
// =====================================================================
export function useAwardBadge() {
  const queryClient = useQueryClient();
  const { currentTenant } = useTenant();

  return useMutation({
    mutationFn: async ({
      userId,
      badgeDefinitionId,
      eventType,
    }: {
      userId: string;
      badgeDefinitionId: string;
      eventType?: string;
    }) => {
      if (!currentTenant?.id) {
        throw new Error("No active tenant");
      }
      return awardBadge(userId, currentTenant.id, badgeDefinitionId, eventType);
    },
    onSuccess: (data, variables) => {
      // Invalidate user badges query
      queryClient.invalidateQueries({
        queryKey: ["user-badges", variables.userId, currentTenant?.id],
      });
      // Invalidate stats
      queryClient.invalidateQueries({
        queryKey: ["badge-stats", variables.userId, currentTenant?.id],
      });
    },
  });
}

// =====================================================================
// HOOK: useMarkBadgeAsSeen
// Mutation to mark a badge notification as seen
// =====================================================================
export function useMarkBadgeAsSeen() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (badgeId: string) => markBadgeAsSeen(badgeId),
    onSuccess: () => {
      // Invalidate all badge queries
      queryClient.invalidateQueries({ queryKey: ["user-badges"] });
    },
  });
}

// =====================================================================
// HOOK: useToggleBadgeShare
// Mutation to toggle badge sharing
// =====================================================================
export function useToggleBadgeShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      badgeId,
      shared,
    }: {
      badgeId: string;
      shared: boolean;
    }) => toggleBadgeShare(badgeId, shared),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-badges"] });
    },
  });
}

// =====================================================================
// HOOK: useClassBadgeLeaderboard
// Fetch badge leaderboard for a class
// =====================================================================
export function useClassBadgeLeaderboard(classId?: string) {
  return useQuery({
    queryKey: ["badge-leaderboard", classId],
    queryFn: async () => {
      if (!classId) {
        return [];
      }
      return fetchClassBadgeLeaderboard(classId);
    },
    enabled: !!classId,
    staleTime: 15 * 60 * 1000, // 15 minutes
  });
}

// =====================================================================
// HOOK: useEligibleBadges
// Check which badges user is eligible to unlock
// =====================================================================
export function useEligibleBadges() {
  const { user } = useAuth();
  const { currentTenant } = useTenant();

  return useQuery({
    queryKey: ["eligible-badges", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!user?.id || !currentTenant?.id) {
        return null;
      }
      return checkEligibleBadges(user.id, currentTenant.id);
    },
    enabled: !!user?.id && !!currentTenant?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// =====================================================================
// HOOK: useBadgeNotifications
// Initialize real-time badge notifications
// =====================================================================
export function useBadgeNotifications(
  onNewBadge?: (notification: BadgeNotification) => void
) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<BadgeNotification[]>([]);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    // Initialize notifications
    const unsubscribe = initializeBadgeNotifications(user.id, (notification) => {
      // Play sound/haptic
      playNotificationSound();
      triggerHapticFeedback(50);

      // Add to local state
      setNotifications((prev) => [notification, ...prev]);

      // Call callback if provided
      if (onNewBadge) {
        onNewBadge(notification);
      }

      // Auto-dismiss after 10 seconds
      const timer = setTimeout(() => {
        setNotifications((prev) =>
          prev.filter((n) => n.id !== notification.id)
        );
      }, 10000);
      timersRef.current.push(timer);
    });

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      unsubscribe();
    };
  }, [user?.id, onNewBadge]);

  return {
    notifications,
    clearAll: () => setNotifications([]),
    dismiss: (id: string) =>
      setNotifications((prev) => prev.filter((n) => n.id !== id)),
  };
}

// =====================================================================
// HOOK: useBadgeFilter
// Helper hook for filtering and sorting badges
// =====================================================================
export function useBadgeFilter(badges: any[], initialFilter = "all") {
  const [filter, setFilter] = useState(initialFilter);
  const [sortBy, setSortBy] = useState("date");

  const filtered = useCallback(() => {
    let result = [...badges];

    // Filter by type
    if (filter !== "all") {
      result = result.filter((b) => b.badge?.badge_type === filter);
    }

    // Sort
    switch (sortBy) {
      case "date":
        result.sort(
          (a, b) =>
            new Date(b.earned_date).getTime() -
            new Date(a.earned_date).getTime()
        );
        break;
      case "rarity": {
        const rarityOrder = {
          LEGENDARY: 5,
          EPIC: 4,
          RARE: 3,
          UNCOMMON: 2,
          COMMON: 1,
        };
        result.sort(
          (a, b) =>
            (rarityOrder[b.badge?.rarity as keyof typeof rarityOrder] || 0) -
            (rarityOrder[a.badge?.rarity as keyof typeof rarityOrder] || 0)
        );
        break;
      }
      case "name":
        result.sort((a, b) =>
          (a.badge?.name || "").localeCompare(b.badge?.name || "")
        );
        break;
    }

    return result;
  }, [badges, filter, sortBy]);

  return {
    filter,
    setFilter,
    sortBy,
    setSortBy,
    filtered: filtered(),
  };
}

// =====================================================================
// HOOK: useBadgeProgress
// Track progress towards earning next badges
// =====================================================================
export function useBadgeProgress() {
  const { user } = useAuth();
  const { currentTenant } = useTenant();

  return useQuery({
    queryKey: ["badge-progress", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!user?.id || !currentTenant?.id) {
        return null;
      }

      // This would fetch progress data from an API
      // For now, return a placeholder
      return {
        nextBadges: [],
        progressItems: [],
        estimatedTimeToNext: "N/A",
      };
    },
    enabled: !!user?.id && !!currentTenant?.id,
    staleTime: 10 * 60 * 1000,
  });
}

// =====================================================================
// HOOK: useBadgePreferences
// Manage user badge notification preferences
// =====================================================================
export function useBadgePreferences() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState({
    toastEnabled: true,
    emailEnabled: false,
    pushEnabled: true,
    soundEnabled: true,
    mutedBadges: [] as string[],
  });

  useEffect(() => {
    if (!user?.id) return;

    // Load from localStorage
    const saved = localStorage.getItem(`badge_prefs_${user.id}`);
    if (saved) {
      try {
        setPreferences(JSON.parse(saved));
      } catch (error) {
        console.error("Error loading preferences:", error);
      }
    }
  }, [user?.id]);

  const updatePreferences = useCallback(
    (updates: Partial<typeof preferences>) => {
      if (!user?.id) return;

      const newPrefs = { ...preferences, ...updates };
      setPreferences(newPrefs);
      localStorage.setItem(`badge_prefs_${user.id}`, JSON.stringify(newPrefs));
    },
    [user?.id, preferences]
  );

  return {
    preferences,
    updatePreferences,
  };
}

// =====================================================================
// HOOK: useBadgeAnalytics
// Get analytics for badge system (admin use)
// =====================================================================
export function useBadgeAnalytics() {
  const { currentTenant } = useTenant();

  return useQuery({
    queryKey: ["badge-analytics", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant?.id) {
        return null;
      }

      // This would fetch analytics from an API
      // For now, return a placeholder
      return {
        totalBadgesAwarded: 0,
        totalUsersWithBadges: 0,
        mostCommonBadge: null,
        recentUnlocks: [],
      };
    },
    enabled: !!currentTenant?.id,
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}
