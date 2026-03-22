/**
 * Badge System Integration Guide
 * How to integrate badge components and hooks into existing pages
 */

// =========================================================================
// 1. ACHIEVEMENTS PAGE INTEGRATION
// =========================================================================
// File: src/pages/Achievements.tsx
// Update imports to include hooks:

import { useUserBadges, useBadgeStats, useEligibleBadges, useBadgeNotifications } from "@/hooks/useBadges";
import BadgeNotificationContainer from "@/components/badges/BadgeNotification";

export default function AchievementsPage() {
  const { user } = useAuth();
  const { currentTenant } = useTenant();

  // Use hooks instead of React Query directly
  const { data: userBadges, isLoading: badgesLoading } = useUserBadges();
  const { data: stats, isLoading: statsLoading } = useBadgeStats();
  const { data: eligible } = useEligibleBadges();
  const { notifications } = useBadgeNotifications();

  // ... rest of component logic
}

// =========================================================================
// 2. PROFILE PAGE INTEGRATION
// =========================================================================
// File: src/pages/Profile.tsx
// Add badge section:

import BadgeGrid from "@/components/badges/BadgeGrid";
import { useUserBadges, useBadgeStats } from "@/hooks/useBadges";

function ProfileBadgeSection() {
  const { data: userBadges, isLoading } = useUserBadges();
  const { data: stats } = useBadgeStats();

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="mt-8">
      <h2 className="text-2xl font-bold mb-4">Badge Achievements</h2>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard
          icon={<Trophy />}
          label="Total Badges"
          value={stats?.totalBadges || 0}
        />
        <StatCard
          icon={<Star />}
          label="Completion"
          value={`${Math.round((stats?.totalBadges || 0) / (stats?.nextMilestones?.length || 1) * 100)}%`}
        />
        <StatCard
          icon={<Sparkles />}
          label="Recent Badge"
          value={userBadges?.[0]?.badge?.name || "None"}
        />
      </div>
      {userBadges && <BadgeGrid badges={userBadges} defaultView="recent" />}
    </div>
  );
}

// =========================================================================
// 3. DASHBOARD WIDGET INTEGRATION
// =========================================================================
// File: src/components/dashboard/BadgeWidget.tsx
// Create a widget component:

import { useUserBadges } from "@/hooks/useBadges";
import BadgeDisplay from "@/components/badges/BadgeDisplay";

export function BadgeWidget() {
  const { data: userBadges } = useUserBadges();

  // Get 3 most recent badges
  const recentBadges = (userBadges || []).slice(0, 3);

  return (
    <Card className="p-4">
      <h3 className="font-bold mb-3">Recent Achievements</h3>
      {recentBadges.length > 0 ? (
        <div className="flex gap-3">
          {recentBadges.map((badge) => (
            <BadgeDisplay
              key={badge.id}
              badge={badge.badge}
              size="md"
              showName={false}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No badges earned yet</p>
      )}
    </Card>
  );
}

// =========================================================================
// 4. CLASS PAGE LEADERBOARD INTEGRATION
// =========================================================================
// File: src/pages/ClassPage.tsx
// Add leaderboard section:

import { useClassBadgeLeaderboard } from "@/hooks/useBadges";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function BadgeLeaderboard({ classId }: { classId: string }) {
  const { data: leaderboard, isLoading } = useClassBadgeLeaderboard(classId);

  if (isLoading) return <LoadingSpinner />;

  return (
    <Card className="p-6">
      <h3 className="text-xl font-bold mb-4">Badge Leaderboard</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Rank</TableHead>
            <TableHead>Student</TableHead>
            <TableHead>Total Badges</TableHead>
            <TableHead>Performance</TableHead>
            <TableHead>Achievement</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leaderboard?.map((entry, idx) => (
            <TableRow key={entry.userId}>
              <TableCell className="font-bold">
                {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
              </TableCell>
              <TableCell>{entry.userName}</TableCell>
              <TableCell>{entry.totalBadges}</TableCell>
              <TableCell>{entry.badgesByType.performance}</TableCell>
              <TableCell>{entry.badgesByType.achievement}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// =========================================================================
// 5. NOTIFICATION SYSTEM INTEGRATION
// =========================================================================
// File: src/App.tsx (Root level)
// Add notification container at app level:

import { useBadgeNotifications } from "@/hooks/useBadges";
import BadgeNotificationContainer from "@/components/badges/BadgeNotification";

export default function App() {
  const { notifications } = useBadgeNotifications();

  return (
    <div className="app">
      {/* Existing app content */}
      
      {/* Badge notifications */}
      <BadgeNotificationContainer notifications={notifications} />
    </div>
  );
}

// =========================================================================
// 6. ADMIN BADGE MANAGEMENT
// =========================================================================
// File: src/pages/admin/BadgeManagement.tsx
// Create admin panel:

import { useBadgeDefinitions, useAwardBadge } from "@/hooks/useBadges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function BadgeManagement() {
  const { data: badges, isLoading } = useBadgeDefinitions();
  const { mutate: awardBadge } = useAwardBadge();

  const handleAwardBadge = (userId: string, badgeId: string) => {
    awardBadge(
      { userId, badgeDefinitionId: badgeId, eventType: "admin_granted" },
      {
        onSuccess: (result) => {
          if (result.success) {
            toast.success(`Badge awarded: ${result.badgeName}`);
          } else {
            toast.error(result.message);
          }
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Badge Management</h1>
      
      {badges?.map((badge) => (
        <Card key={badge.id} className="p-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold">{badge.name}</h3>
              <p className="text-sm text-gray-600">{badge.description}</p>
            </div>
            <Button
              onClick={() => handleAwardBadge("user-id", badge.id)}
              disabled={isLoading}
            >
              Award Badge
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// =========================================================================
// 7. USAGE EXAMPLES IN COMPONENTS
// =========================================================================

// Example 1: Simple badge display
function SimpleBadgeDisplay({ userId }: { userId: string }) {
  const { data: badges } = useUserBadges();
  
  return (
    <div className="flex gap-2">
      {badges?.map((badge) => (
        <BadgeDisplay key={badge.id} badge={badge.badge} size="sm" />
      ))}
    </div>
  );
}

// Example 2: Badge with notification handling
function BadgeWithNotifications() {
  const { notifications, clearAll } = useBadgeNotifications((badge) => {
    console.log("New badge earned:", badge);
    // Custom notification handling
  });

  return (
    <div>
      <BadgeGrid />
      {notifications.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50">
          {notifications.map((notif) => (
            <BadgeNotificationContainer key={notif.id} notifications={[notif]} />
          ))}
        </div>
      )}
    </div>
  );
}

// Example 3: Conditional badge awarding
async function checkAndAwardBadges(userId: string, tenantId: string) {
  const { data: eligible } = useEligibleBadges();
  const { mutate: awardBadge } = useAwardBadge();

  if (eligible?.eligible) {
    for (const badge of eligible.eligible) {
      // Check if user meets requirements
      awardBadge({
        userId,
        badgeDefinitionId: badge.id,
        eventType: "auto_award",
      });
    }
  }
}

// =========================================================================
// 8. PERMISSIONS & SECURITY
// =========================================================================

// Badges can only be viewed by:
// - The user who earned them (all details visible)
// - Teachers/Staff (can award and view class leaderboard)
// - Admins (full CRUD access)

// RLS Policies enforce:
// - Users can only see their own earned badges
// - Admins can manage all badges for their tenant
// - Service role can insert logs and auto-award

// =========================================================================
// 9. PERFORMANCE OPTIMIZATION
// =========================================================================

// Use React Query's caching:
// - Badge definitions: 30 minute cache (rarely change)
// - User badges: 5 minute cache (moderately volatile)
// - Stats: 10 minute cache (calculated)
// - Leaderboard: 15 minute cache (calculated)

// Pagination for large badge collections:
// const { data: badges, hasMore, fetchMore } = useInfiniteQuery({
//   queryKey: ["user-badges"],
//   queryFn: ({ pageParam = 0 }) => fetchUserBadges(pageParam),
//   getNextPageParam: (lastPage) => lastPage.nextCursor,
// });

// =========================================================================
// 10. ERROR HANDLING
// =========================================================================

// All hooks include error handling:
function SafeBadgeDisplay({ userId }: { userId: string }) {
  const { data: badges, error, isLoading } = useUserBadges();

  if (error) {
    return <div className="text-red-500">Failed to load badges</div>;
  }

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return <BadgeGrid badges={badges || []} />;
}
