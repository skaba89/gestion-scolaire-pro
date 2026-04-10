/**
 * Profile Badge Section
 * Integrated badge display for user profile page
 */

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Trophy, Target, Zap } from "lucide-react";
import { useUserBadges, useBadgeStats, useEligibleBadges } from "@/hooks/useBadges";
import BadgeGrid from "@/components/badges/BadgeGrid";
import BadgeDisplay from "@/components/badges/BadgeDisplay";

/**
 * Component: ProfileBadgeSection
 * Displays comprehensive badge information on user profile
 */
export function ProfileBadgeSection() {
  const { data: userBadges, isLoading: badgesLoading } = useUserBadges();
  const { data: stats, isLoading: statsLoading } = useBadgeStats();
  const { data: eligible } = useEligibleBadges();

  const isLoading = badgesLoading || statsLoading;

  if (isLoading) {
    return (
      <Card className="p-8 bg-gradient-to-br from-amber-50 to-orange-50">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-40"></div>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  const completionPercent = stats?.totalBadges
    ? Math.round((stats.totalBadges / (stats.nextMilestones?.length || 25)) * 100)
    : 0;

  return (
    <Card className="p-8 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Trophy className="w-6 h-6 text-amber-600" />
          <h2 className="text-2xl font-bold text-gray-900">Badge Achievements</h2>
        </div>
        <p className="text-sm text-gray-600">
          Your journey of excellence and achievement
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Total Badges Card */}
        <div className="bg-white rounded-lg p-4 border border-amber-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-600">Total Badges</p>
            <Trophy className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-3xl font-bold text-amber-600">
            {stats?.totalBadges || 0}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Out of {stats?.nextMilestones?.length || 25} available
          </p>
        </div>

        {/* Completion Card */}
        <div className="bg-white rounded-lg p-4 border border-purple-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-600">Completion</p>
            <Target className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-3xl font-bold text-purple-600">{completionPercent}%</p>
          <Progress value={completionPercent} className="mt-2" />
        </div>

        {/* Rarest Badge Card */}
        <div className="bg-white rounded-lg p-4 border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-600">Rarest Badge</p>
            <Zap className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2 flex items-center gap-3">
            {userBadges && userBadges[0]?.badge ? (
              <>
                <BadgeDisplay
                  badge={userBadges[0].badge}
                  size="sm"
                  showName={false}
                />
                <p className="text-sm font-semibold text-gray-700">
                  {userBadges[0].badge.rarity}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">None yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Badge Type Breakdown */}
      <div className="bg-white rounded-lg p-4 border border-gray-200 mb-6">
        <h3 className="font-semibold text-gray-900 mb-3">Badges by Type</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            {
              type: "Performance",
              count: stats?.badgesByType.performance || 0,
              color: "bg-red-100 text-red-700",
            },
            {
              type: "Achievement",
              count: stats?.badgesByType.achievement || 0,
              color: "bg-blue-100 text-blue-700",
            },
            {
              type: "Attendance",
              count: stats?.badgesByType.attendance || 0,
              color: "bg-purple-100 text-purple-700",
            },
            {
              type: "Participation",
              count: stats?.badgesByType.participation || 0,
              color: "bg-orange-100 text-orange-700",
            },
            {
              type: "Certification",
              count: stats?.badgesByType.certification || 0,
              color: "bg-green-100 text-green-700",
            },
          ].map((item) => (
            <div
              key={item.type}
              className={`rounded-lg p-3 text-center ${item.color}`}
            >
              <p className="text-2xl font-bold">{item.count}</p>
              <p className="text-xs font-medium">{item.type}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs: All / Next Badges */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="all">
            All Badges ({stats?.totalBadges || 0})
          </TabsTrigger>
          <TabsTrigger value="next">
            Next Badges ({eligible?.locked || 0})
          </TabsTrigger>
        </TabsList>

        {/* All Badges Tab */}
        <TabsContent value="all" className="mt-4">
          {userBadges && userBadges.length > 0 ? (
            <BadgeGrid badges={userBadges} defaultView="all" />
          ) : (
            <div className="text-center py-12">
              <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-600 font-medium mb-1">No badges yet</p>
              <p className="text-sm text-gray-500">
                Keep improving your grades and attendance to unlock badges!
              </p>
            </div>
          )}
        </TabsContent>

        {/* Next Badges Tab */}
        <TabsContent value="next" className="mt-4">
          {eligible?.eligible && eligible.eligible.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 mb-4">
                🎯 Badges you can unlock with continued effort:
              </p>
              <BadgeGrid badges={eligible.eligible} defaultView="all" />
            </div>
          ) : (
            <div className="text-center py-12">
              <Zap className="w-12 h-12 text-amber-300 mx-auto mb-3" />
              <p className="text-gray-600 font-medium mb-1">
                All badges unlocked!
              </p>
              <p className="text-sm text-gray-500">
                You've achieved all available badges. Congratulations!
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Tips Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
        <h3 className="font-semibold text-blue-900 mb-2">💡 Tips to Earn Badges</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>✓ Maintain high grades (90%+) to unlock performance badges</li>
          <li>✓ Perfect attendance for attendance achievement</li>
          <li>✓ Active participation in class discussions</li>
          <li>✓ Help your classmates to earn mentor badges</li>
          <li>✓ Complete assignments on time</li>
        </ul>
      </div>
    </Card>
  );
}

export default ProfileBadgeSection;
