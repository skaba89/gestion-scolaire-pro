/**
 * Badge Widget for Dashboard
 * Displays recent badges earned by current user
 */

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Trophy } from "lucide-react";
import { useUserBadges, useBadgeStats } from "@/hooks/useBadges";
import BadgeDisplay from "@/components/badges/BadgeDisplay";
import { Link } from "react-router-dom";

export function BadgeWidget() {
  const { data: userBadges, isLoading } = useUserBadges();
  const { data: stats } = useBadgeStats();

  // Get 3 most recent badges
  const recentBadges = (userBadges || []).slice(0, 3);

  if (isLoading) {
    return (
      <Card className="p-6 bg-gradient-to-br from-purple-50 to-blue-50 border-purple-200">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded mb-4 w-40"></div>
          <div className="flex gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 w-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-gradient-to-br from-purple-50 to-blue-50 border-purple-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-purple-600" />
          <h3 className="text-lg font-bold text-gray-900">Recent Achievements</h3>
        </div>
        <span className="text-sm font-semibold text-purple-600">
          {stats?.totalBadges || 0} earned
        </span>
      </div>

      {recentBadges.length > 0 ? (
        <div className="space-y-3">
          {/* Badge Display Row */}
          <div className="flex gap-4">
            {recentBadges.map((badge) => (
              <div
                key={badge.id}
                className="flex flex-col items-center gap-2"
              >
                <BadgeDisplay
                  badge={badge.badge}
                  size="md"
                  showName={false}
                  showDescription={false}
                />
                <p className="text-xs font-medium text-gray-700 text-center line-clamp-2">
                  {badge.badge?.name}
                </p>
              </div>
            ))}
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-purple-200">
            <div className="text-center">
              <p className="text-xs text-gray-600">Performance</p>
              <p className="text-lg font-bold text-purple-600">
                {stats?.badgesByType.performance || 0}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-600">Achievement</p>
              <p className="text-lg font-bold text-blue-600">
                {stats?.badgesByType.achievement || 0}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-600">Other</p>
              <p className="text-lg font-bold text-indigo-600">
                {(stats?.badgesByType.attendance || 0) +
                  (stats?.badgesByType.participation || 0) +
                  (stats?.badgesByType.certification || 0)}
              </p>
            </div>
          </div>

          {/* View All Button */}
          <Link to="/achievements" className="block">
            <Button
              variant="outline"
              className="w-full mt-3 border-purple-200 hover:bg-purple-50"
            >
              View All Badges
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      ) : (
        <div className="text-center py-6">
          <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600 mb-3">No badges earned yet</p>
          <p className="text-xs text-gray-500">
            Good grades and attendance will unlock badges!
          </p>
        </div>
      )}
    </Card>
  );
}

export default BadgeWidget;
