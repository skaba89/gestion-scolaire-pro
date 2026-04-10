import React, { forwardRef, ButtonHTMLAttributes } from 'react';
import { motion, Variants } from 'framer-motion';
import { cn } from '@/lib/utils';

// Animation variants
const tapVariants: Variants = {
  tap: { scale: 0.97 },
  hover: { scale: 1.02 }
};

// Animated Card with hover effects
interface AnimatedCardProps {
  children: React.ReactNode;
  className?: string;
  hoverEffect?: 'lift' | 'glow' | 'border' | 'tilt';
  onClick?: () => void;
}

export const AnimatedCard: React.FC<AnimatedCardProps> = ({
  children,
  className,
  hoverEffect = 'lift',
  onClick
}) => {
  const getHoverStyles = () => {
    switch (hoverEffect) {
      case 'lift': return 'hover:-translate-y-1 hover:shadow-lg';
      case 'glow': return 'hover:shadow-glow';
      case 'border': return 'hover:border-primary';
      default: return '';
    }
  };

  return (
    <motion.div
      className={cn(
        "rounded-xl bg-card border transition-all duration-300 cursor-pointer",
        getHoverStyles(),
        className
      )}
      whileHover={hoverEffect === 'tilt' ? { rotateX: 5, rotateY: 5 } : undefined}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
};

// Staggered List Animation
interface StaggeredListProps {
  children: React.ReactNode[];
  staggerDelay?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
}

export const StaggeredList: React.FC<StaggeredListProps> = ({
  children,
  staggerDelay = 0.1,
  direction = 'up'
}) => {
  const getInitialPosition = () => {
    switch (direction) {
      case 'up': return { y: 20, opacity: 0 };
      case 'down': return { y: -20, opacity: 0 };
      case 'left': return { x: 20, opacity: 0 };
      case 'right': return { x: -20, opacity: 0 };
    }
  };

  return (
    <>
      {React.Children.map(children, (child, index) => (
        <motion.div
          key={index}
          initial={getInitialPosition()}
          animate={{ x: 0, y: 0, opacity: 1 }}
          transition={{ delay: index * staggerDelay, duration: 0.4, ease: 'easeOut' }}
        >
          {child}
        </motion.div>
      ))}
    </>
  );
};

// Animated Counter
interface AnimatedCounterProps {
  value: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  value,
  duration = 1,
  className,
  prefix = '',
  suffix = ''
}) => {
  const [displayValue, setDisplayValue] = React.useState(0);

  React.useEffect(() => {
    const startTime = Date.now();
    const startValue = displayValue;
    
    const animate = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      setDisplayValue(Math.round(startValue + (value - startValue) * easeOutQuart));
      if (progress < 1) requestAnimationFrame(animate);
    };
    
    requestAnimationFrame(animate);
  }, [value, duration]);

  return <span className={className}>{prefix}{displayValue.toLocaleString()}{suffix}</span>;
};

// Skeleton Shimmer
export const SkeletonShimmer: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn(
    "relative overflow-hidden bg-muted rounded-lg",
    "before:absolute before:inset-0 before:-translate-x-full",
    "before:animate-[shimmer_1.5s_infinite]",
    "before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent",
    className
  )} />
);

// Page transition wrapper
export const PageTransitionWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    transition={{ duration: 0.3 }}
  >
    {children}
  </motion.div>
);
