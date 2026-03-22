/**
 * BadgeDisplay Component
 * Renders badge with 5 different template styles:
 * - Circle: Classic circle with icon
 * - Ribbon: Official ribbon banner style
 * - 3D: Premium embossed effect
 * - Minimalist: Clean simple design
 * - Animated: Interactive with glow effect
 */

import React from "react";
import { BadgeDefinition, BadgeTemplate } from "@/lib/badges-types";
import { cn } from "@/lib/utils";

interface BadgeDisplayProps {
  badge: BadgeDefinition;
  size?: "sm" | "md" | "lg" | "xl";
  showName?: boolean;
  showDescription?: boolean;
  onClick?: () => void;
  className?: string;
}

const BADGE_SIZES = {
  sm: { width: 80, height: 80, fontSize: 12 },
  md: { width: 120, height: 120, fontSize: 14 },
  lg: { width: 160, height: 160, fontSize: 16 },
  xl: { width: 200, height: 200, fontSize: 18 },
};

// =====================================================================
// CIRCLE TEMPLATE - Classic minimalist circle
// =====================================================================
const CircleBadge: React.FC<{
  badge: BadgeDefinition;
  size: "sm" | "md" | "lg" | "xl";
}> = ({ badge, size }) => {
  const dims = BADGE_SIZES[size];
  const r = (dims.width / 2) * 0.75;

  return (
    <svg
      width={dims.width}
      height={dims.height}
      viewBox={`0 0 ${dims.width} ${dims.height}`}
      className="drop-shadow-lg"
    >
      {/* Background circle */}
      <circle
        cx={dims.width / 2}
        cy={dims.height / 2}
        r={r}
        fill={badge.color_primary}
        opacity="0.9"
      />

      {/* Border ring */}
      <circle
        cx={dims.width / 2}
        cy={dims.height / 2}
        r={r}
        fill="none"
        stroke={badge.color_secondary}
        strokeWidth="2"
      />

      {/* Icon circle in center */}
      <circle
        cx={dims.width / 2}
        cy={dims.height / 2}
        r={r * 0.6}
        fill={badge.color_secondary}
        opacity="0.2"
      />

      {/* Icon emoji/text */}
      <text
        x={dims.width / 2}
        y={dims.height / 2 + dims.fontSize * 0.5}
        textAnchor="middle"
        fill="white"
        fontSize={dims.fontSize * 2}
        fontWeight="bold"
      >
        ★
      </text>
    </svg>
  );
};

// =====================================================================
// RIBBON TEMPLATE - Official ribbon banner
// =====================================================================
const RibbonBadge: React.FC<{
  badge: BadgeDefinition;
  size: "sm" | "md" | "lg" | "xl";
}> = ({ badge, size }) => {
  const dims = BADGE_SIZES[size];
  const w = dims.width * 0.7;
  const h = dims.height * 0.6;

  return (
    <svg
      width={dims.width}
      height={dims.height}
      viewBox={`0 0 ${dims.width} ${dims.height}`}
      className="drop-shadow-lg"
    >
      {/* Left ribbon */}
      <polygon
        points={`${dims.width / 2 - w / 2 - 15},${dims.height / 2},${dims.width / 2 - w / 2},${dims.height / 2 - h / 2},${dims.width / 2 - w / 2},${dims.height / 2 + h / 2}`}
        fill={badge.color_secondary}
        opacity="0.7"
      />

      {/* Center badge */}
      <rect
        x={dims.width / 2 - w / 2}
        y={dims.height / 2 - h / 2}
        width={w}
        height={h}
        fill={badge.color_primary}
        rx="4"
      />

      {/* Right ribbon */}
      <polygon
        points={`${dims.width / 2 + w / 2 + 15},${dims.height / 2},${dims.width / 2 + w / 2},${dims.height / 2 - h / 2},${dims.width / 2 + w / 2},${dims.height / 2 + h / 2}`}
        fill={badge.color_secondary}
        opacity="0.7"
      />

      {/* Icon in center */}
      <text
        x={dims.width / 2}
        y={dims.height / 2 + dims.fontSize * 0.4}
        textAnchor="middle"
        fill="white"
        fontSize={dims.fontSize * 1.5}
        fontWeight="bold"
      >
        🏆
      </text>
    </svg>
  );
};

// =====================================================================
// 3D TEMPLATE - Premium embossed effect
// =====================================================================
const ThreeDBadge: React.FC<{
  badge: BadgeDefinition;
  size: "sm" | "md" | "lg" | "xl";
}> = ({ badge, size }) => {
  const dims = BADGE_SIZES[size];
  const r = (dims.width / 2) * 0.7;

  return (
    <svg
      width={dims.width}
      height={dims.height}
      viewBox={`0 0 ${dims.width} ${dims.height}`}
      className="drop-shadow-xl"
    >
      {/* Shadow for 3D effect */}
      <defs>
        <radialGradient id={`grad-3d-${badge.id}`}>
          <stop offset="0%" stopColor={badge.color_primary} stopOpacity="1" />
          <stop offset="100%" stopColor={badge.color_secondary} stopOpacity="0.8" />
        </radialGradient>
      </defs>

      {/* Background sphere */}
      <circle
        cx={dims.width / 2 - 2}
        cy={dims.height / 2 + 3}
        r={r}
        fill="black"
        opacity="0.2"
      />

      {/* Main circle with gradient */}
      <circle
        cx={dims.width / 2}
        cy={dims.height / 2}
        r={r}
        fill={`url(#grad-3d-${badge.id})`}
      />

      {/* Highlight for shine */}
      <ellipse
        cx={dims.width / 2 - r * 0.3}
        cy={dims.height / 2 - r * 0.3}
        rx={r * 0.3}
        ry={r * 0.25}
        fill="white"
        opacity="0.4"
      />

      {/* Icon */}
      <text
        x={dims.width / 2}
        y={dims.height / 2 + dims.fontSize * 0.4}
        textAnchor="middle"
        fill="white"
        fontSize={dims.fontSize * 2}
        fontWeight="bold"
        filter="drop-shadow(2px 2px 2px rgba(0,0,0,0.3))"
      >
        ✓
      </text>
    </svg>
  );
};

// =====================================================================
// MINIMALIST TEMPLATE - Clean and simple
// =====================================================================
const MinimalistBadge: React.FC<{
  badge: BadgeDefinition;
  size: "sm" | "md" | "lg" | "xl";
}> = ({ badge, size }) => {
  const dims = BADGE_SIZES[size];
  const s = dims.width * 0.65;

  return (
    <svg
      width={dims.width}
      height={dims.height}
      viewBox={`0 0 ${dims.width} ${dims.height}`}
      className="drop-shadow-md"
    >
      {/* Square background */}
      <rect
        x={dims.width / 2 - s / 2}
        y={dims.height / 2 - s / 2}
        width={s}
        height={s}
        fill="white"
        stroke={badge.color_primary}
        strokeWidth="2"
        rx="8"
      />

      {/* Icon */}
      <text
        x={dims.width / 2}
        y={dims.height / 2 + dims.fontSize * 0.4}
        textAnchor="middle"
        fill={badge.color_primary}
        fontSize={dims.fontSize * 1.8}
        fontWeight="bold"
      >
        ◆
      </text>
    </svg>
  );
};

// =====================================================================
// ANIMATED TEMPLATE - Interactive glow
// =====================================================================
const AnimatedBadge: React.FC<{
  badge: BadgeDefinition;
  size: "sm" | "md" | "lg" | "xl";
}> = ({ badge, size }) => {
  const dims = BADGE_SIZES[size];
  const r = (dims.width / 2) * 0.65;

  return (
    <svg
      width={dims.width}
      height={dims.height}
      viewBox={`0 0 ${dims.width} ${dims.height}`}
      className="drop-shadow-lg hover:drop-shadow-2xl transition-all duration-300 animate-pulse"
    >
      <defs>
        <style>{`
          @keyframes glow {
            0%, 100% { filter: drop-shadow(0 0 4px ${badge.color_secondary}); }
            50% { filter: drop-shadow(0 0 12px ${badge.color_secondary}); }
          }
          .badge-glow {
            animation: glow 2s infinite;
          }
        `}</style>
      </defs>

      {/* Outer ring */}
      <circle
        cx={dims.width / 2}
        cy={dims.height / 2}
        r={r + 4}
        fill="none"
        stroke={badge.color_secondary}
        strokeWidth="1"
        opacity="0.5"
      />

      {/* Main circle */}
      <circle
        cx={dims.width / 2}
        cy={dims.height / 2}
        r={r}
        fill={badge.color_primary}
        className="badge-glow"
      />

      {/* Inner glow */}
      <circle
        cx={dims.width / 2}
        cy={dims.height / 2}
        r={r * 0.5}
        fill={badge.color_secondary}
        opacity="0.3"
      />

      {/* Icon with animation */}
      <text
        x={dims.width / 2}
        y={dims.height / 2 + dims.fontSize * 0.5}
        textAnchor="middle"
        fill="white"
        fontSize={dims.fontSize * 2}
        fontWeight="bold"
      >
        ⭐
      </text>
    </svg>
  );
};

// =====================================================================
// MAIN COMPONENT
// =====================================================================
export const BadgeDisplay: React.FC<BadgeDisplayProps> = ({
  badge,
  size = "md",
  showName = false,
  showDescription = false,
  onClick,
  className,
}) => {
  const renderTemplate = () => {
    switch (badge.badge_template) {
      case "circle":
        return <CircleBadge badge={badge} size={size} />;
      case "ribbon":
        return <RibbonBadge badge={badge} size={size} />;
      case "3d":
        return <ThreeDBadge badge={badge} size={size} />;
      case "minimalist":
        return <MinimalistBadge badge={badge} size={size} />;
      case "animated":
        return <AnimatedBadge badge={badge} size={size} />;
      default:
        return <CircleBadge badge={badge} size={size} />;
    }
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-2",
        onClick && "cursor-pointer hover:scale-105 transition-transform",
        className
      )}
    >
      <div className="flex justify-center">{renderTemplate()}</div>

      {showName && (
        <h3 className="text-sm font-bold text-center max-w-xs">{badge.name}</h3>
      )}

      {showDescription && (
        <p className="text-xs text-gray-600 text-center max-w-xs">{badge.description}</p>
      )}
    </div>
  );
};

export default BadgeDisplay;
