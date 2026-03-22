/**
 * Badge Notification Component
 * Toast notification for newly earned badges with animation
 */

import React, { useEffect } from "react";
import { BadgeDefinition } from "@/lib/badges-types";
import { BadgeDisplay } from "./BadgeDisplay";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface BadgeNotificationProps {
  badge: BadgeDefinition;
  userName?: string;
  onDismiss?: () => void;
  onViewProfile?: () => void;
  autoDismissSeconds?: number;
  className?: string;
}

export const BadgeNotification: React.FC<BadgeNotificationProps> = ({
  badge,
  userName = "You",
  onDismiss,
  onViewProfile,
  autoDismissSeconds = 8,
  className,
}) => {
  const [isVisible, setIsVisible] = React.useState(true);

  // Auto dismiss after specified seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      onDismiss?.();
    }, autoDismissSeconds * 1000);

    return () => clearTimeout(timer);
  }, [autoDismissSeconds, onDismiss]);

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 max-w-md animate-in slide-in-from-bottom-5 z-50",
        className
      )}
    >
      <div className="bg-white rounded-lg shadow-2xl overflow-hidden border-2 border-amber-300">
        {/* Animated gradient border at top */}
        <div className="h-1 bg-gradient-to-r from-yellow-400 via-yellow-500 to-amber-500 animate-pulse" />

        <div className="p-6 space-y-4">
          {/* Header with close button */}
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-bold text-lg text-gray-900">
                🎉 Badge Unlocked!
              </h3>
              <p className="text-sm text-gray-600">
                {userName} earned a new badge
              </p>
            </div>
            <button
              onClick={() => {
                setIsVisible(false);
                onDismiss?.();
              }}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Badge display */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex justify-center sm:justify-start flex-shrink-0">
              <div className="relative">
                <BadgeDisplay badge={badge} size="lg" />
                {/* Sparkle effects */}
                <div className="absolute inset-0 animate-pulse">
                  <div className="absolute top-0 right-0 w-3 h-3 bg-yellow-300 rounded-full opacity-50" />
                  <div className="absolute bottom-0 left-0 w-3 h-3 bg-yellow-300 rounded-full opacity-50" />
                </div>
              </div>
            </div>

            {/* Badge info */}
            <div className="flex-1 space-y-2">
              <div>
                <h4 className="font-bold text-gray-900">{badge.name}</h4>
                <p className="text-sm text-gray-600">{badge.description}</p>
              </div>

              {/* Rarity badge */}
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-xs font-semibold px-3 py-1 rounded-full",
                    badge.rarity === "legendary" && "bg-purple-200 text-purple-900",
                    badge.rarity === "epic" && "bg-blue-200 text-blue-900",
                    badge.rarity === "rare" && "bg-amber-200 text-amber-900",
                    badge.rarity === "uncommon" && "bg-green-200 text-green-900",
                    badge.rarity === "common" && "bg-gray-200 text-gray-900"
                  )}
                >
                  {badge.rarity?.toUpperCase()} BADGE
                </span>
              </div>

              {/* Achievement message */}
              <p className="text-xs text-gray-500 italic">
                Keep improving to earn more badges!
              </p>
            </div>
          </div>

          {/* Action buttons */}
          {onViewProfile && (
            <div className="flex gap-2 pt-2 border-t">
              <Button
                onClick={() => {
                  setIsVisible(false);
                  onViewProfile();
                }}
                className="flex-1 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white"
              >
                View Profile
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsVisible(false);
                  onDismiss?.();
                }}
                className="flex-1"
              >
                Dismiss
              </Button>
            </div>
          )}
        </div>

        {/* Progress bar for auto-dismiss */}
        <div className="h-1 bg-gray-200 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 animate-shrink"
            style={{
              animation: `shrink ${autoDismissSeconds}s linear forwards`,
            }}
          />
        </div>
      </div>

      {/* CSS animation keyframe */}
      <style>{`
        @keyframes shrink {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>
    </div>
  );
};

// =====================================================================
// BADGE NOTIFICATION CONTAINER
// Manages multiple notifications
// =====================================================================

interface BadgeNotification {
  id: string;
  badge: BadgeDefinition;
  userName?: string;
}

interface BadgeNotificationContainerProps {
  notifications: BadgeNotification[];
  onDismiss: (id: string) => void;
  onViewProfile?: (badgeId: string) => void;
}

export const BadgeNotificationContainer: React.FC<BadgeNotificationContainerProps> = ({
  notifications,
  onDismiss,
  onViewProfile,
}) => {
  return (
    <div className="fixed bottom-4 right-4 space-y-3 z-50 pointer-events-none">
      {notifications.map((notification) => (
        <div key={notification.id} className="pointer-events-auto">
          <BadgeNotification
            badge={notification.badge}
            userName={notification.userName}
            onDismiss={() => onDismiss(notification.id)}
            onViewProfile={() => onViewProfile?.(notification.badge.id)}
          />
        </div>
      ))}
    </div>
  );
};

export default BadgeNotification;
