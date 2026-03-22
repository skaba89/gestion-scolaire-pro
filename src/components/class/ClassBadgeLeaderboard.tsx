/**
 * Class Badge Leaderboard
 * Displays badge rankings for a classroom
 */

import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Medal, TrendingUp } from "lucide-react";
import { useClassBadgeLeaderboard } from "@/hooks/useBadges";
import BadgeDisplay from "@/components/badges/BadgeDisplay";

interface ClassBadgeLeaderboardProps {
  classId: string;
  className?: string;
  maxRows?: number;
}

/**
 * Component: ClassBadgeLeaderboard
 * Displays ranking of students by badge achievements
 */
export function ClassBadgeLeaderboard({
  classId,
  className = "",
  maxRows = 10,
}: ClassBadgeLeaderboardProps) {
  const { data: leaderboard, isLoading, error } = useClassBadgeLeaderboard(classId);

  if (isLoading) {
    return (
      <Card className={`p-6 bg-gradient-to-br from-blue-50 to-cyan-50 ${className}`}>
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-gray-200 rounded w-40"></div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  if (error || !leaderboard) {
    return (
      <Card className={`p-6 bg-red-50 border-red-200 ${className}`}>
        <p className="text-red-600 font-medium">Failed to load leaderboard</p>
      </Card>
    );
  }

  const displayedLeaderboard = leaderboard.slice(0, maxRows);

  const getMedalEmoji = (rank: number) => {
    switch (rank) {
      case 1:
        return "🥇";
      case 2:
        return "🥈";
      case 3:
        return "🥉";
      default:
        return `${rank}.`;
    }
  };

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return "bg-yellow-50 border-yellow-200";
      case 2:
        return "bg-gray-50 border-gray-200";
      case 3:
        return "bg-orange-50 border-orange-200";
      default:
        return "bg-white border-gray-200";
    }
  };

  return (
    <Card className={`p-6 bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Medal className="w-6 h-6 text-blue-600" />
          <h2 className="text-2xl font-bold text-gray-900">Badge Leaderboard</h2>
        </div>
        <Badge variant="secondary" className="ml-auto">
          {displayedLeaderboard.length} students
        </Badge>
      </div>

      {displayedLeaderboard.length > 0 ? (
        <div className="space-y-2">
          {displayedLeaderboard.map((entry, idx) => (
            <div
              key={entry.userId}
              className={`rounded-lg border p-4 transition-colors hover:shadow-md ${getRankColor(entry.rank)}`}
            >
              <div className="flex items-center gap-4">
                {/* Rank Medal */}
                <div className="w-10 flex items-center justify-center">
                  <span className="text-2xl font-bold">
                    {getMedalEmoji(entry.rank)}
                  </span>
                </div>

                {/* Student Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">
                    {entry.userName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {entry.totalBadges} badges earned
                  </p>
                </div>

                {/* Badge Stats */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-center">
                    <div className="flex gap-1 justify-center mb-1">
                      {[...Array(Math.min(entry.totalBadges, 5))].map((_, i) => (
                        <div
                          key={i}
                          className="w-3 h-3 rounded-full bg-gradient-to-r from-purple-400 to-pink-400"
                        ></div>
                      ))}
                    </div>
                    <p className="text-xs font-medium text-gray-600">
                      {entry.badgesByType.performance > 0 && (
                        <span className="text-amber-600">
                          {entry.badgesByType.performance}
                        </span>
                      )}
                      {entry.badgesByType.performance > 0 &&
                        entry.badgesByType.achievement > 0 && <span> / </span>}
                      {entry.badgesByType.achievement > 0 && (
                        <span className="text-blue-600">
                          {entry.badgesByType.achievement}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Trending Indicator (top 3) */}
                {entry.rank <= 3 && (
                  <TrendingUp className="w-5 h-5 text-green-500 flex-shrink-0" />
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <Medal className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">No badges awarded yet</p>
          <p className="text-sm text-gray-500">
            Badges will appear here as students earn achievements
          </p>
        </div>
      )}

      {/* Footer Stats */}
      {displayedLeaderboard.length > 0 && (
        <div className="mt-6 pt-4 border-t border-blue-200 grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-xs text-gray-600 mb-1">Top Performer</p>
            <p className="text-lg font-bold text-amber-600">
              {displayedLeaderboard[0]?.totalBadges || 0}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-600 mb-1">Avg Badges</p>
            <p className="text-lg font-bold text-blue-600">
              {Math.round(
                displayedLeaderboard.reduce((sum, e) => sum + e.totalBadges, 0) /
                  displayedLeaderboard.length
              )}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-600 mb-1">Total Awarded</p>
            <p className="text-lg font-bold text-purple-600">
              {displayedLeaderboard.reduce((sum, e) => sum + e.totalBadges, 0)}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

export default ClassBadgeLeaderboard;
