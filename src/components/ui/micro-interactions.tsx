import { motion, HTMLMotionProps } from "framer-motion";
import { forwardRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Animated Button Wrapper
interface AnimatedButtonProps extends HTMLMotionProps<"div"> {
  children: ReactNode;
  className?: string;
}

export const AnimatedButton = forwardRef<HTMLDivElement, AnimatedButtonProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        className={cn("inline-block", className)}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);
AnimatedButton.displayName = "AnimatedButton";

// Pulse on Hover
export const PulseOnHover = ({ children, className }: { children: ReactNode; className?: string }) => (
  <motion.div
    whileHover={{ 
      scale: [1, 1.05, 1],
      transition: { duration: 0.3 }
    }}
    className={className}
  >
    {children}
  </motion.div>
);

// Glow Effect Wrapper
export const GlowWrapper = ({ children, className }: { children: ReactNode; className?: string }) => (
  <motion.div
    className={cn("relative", className)}
    whileHover="hover"
    initial="initial"
  >
    <motion.div
      className="absolute inset-0 rounded-lg bg-primary/20 blur-xl"
      variants={{
        initial: { opacity: 0, scale: 0.8 },
        hover: { opacity: 1, scale: 1.1 }
      }}
      transition={{ duration: 0.3 }}
    />
    <div className="relative">{children}</div>
  </motion.div>
);

// Shake on Error
export const ShakeOnError = ({ 
  children, 
  isError,
  className 
}: { 
  children: ReactNode; 
  isError: boolean;
  className?: string;
}) => (
  <motion.div
    animate={isError ? {
      x: [0, -10, 10, -10, 10, 0],
      transition: { duration: 0.5 }
    } : {}}
    className={className}
  >
    {children}
  </motion.div>
);

// Success Checkmark Animation
export const SuccessCheck = ({ show }: { show: boolean }) => (
  <motion.div
    initial={{ scale: 0, opacity: 0 }}
    animate={show ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
    transition={{ type: "spring", stiffness: 300, damping: 20 }}
    className="flex items-center justify-center"
  >
    <motion.svg
      className="h-6 w-6 text-green-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <motion.path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
        initial={{ pathLength: 0 }}
        animate={show ? { pathLength: 1 } : { pathLength: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      />
    </motion.svg>
  </motion.div>
);

// Loading Dots
export const LoadingDots = ({ className }: { className?: string }) => (
  <div className={cn("flex space-x-1", className)}>
    {[0, 1, 2].map((i) => (
      <motion.div
        key={i}
        className="h-2 w-2 rounded-full bg-primary"
        animate={{
          y: [0, -8, 0],
          opacity: [0.5, 1, 0.5]
        }}
        transition={{
          duration: 0.6,
          repeat: Infinity,
          delay: i * 0.1
        }}
      />
    ))}
  </div>
);

// Floating Label Input Wrapper
export const FloatingInput = ({ 
  children, 
  isFocused,
  className 
}: { 
  children: ReactNode; 
  isFocused: boolean;
  className?: string;
}) => (
  <motion.div
    animate={{
      borderColor: isFocused ? "hsl(var(--primary))" : "hsl(var(--border))",
      boxShadow: isFocused 
        ? "0 0 0 2px hsl(var(--primary) / 0.2)" 
        : "0 0 0 0px transparent"
    }}
    transition={{ duration: 0.2 }}
    className={cn("rounded-md border", className)}
  >
    {children}
  </motion.div>
);

// Count Up Animation
export const CountUp = ({ 
  value, 
  duration = 1,
  className 
}: { 
  value: number; 
  duration?: number;
  className?: string;
}) => (
  <motion.span
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className={className}
  >
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {value}
    </motion.span>
  </motion.span>
);

// Ripple Effect (for buttons)
export const RippleButton = ({ 
  children, 
  onClick,
  className 
}: { 
  children: ReactNode; 
  onClick?: () => void;
  className?: string;
}) => (
  <motion.button
    onClick={onClick}
    whileTap={{ scale: 0.95 }}
    className={cn(
      "relative overflow-hidden",
      className
    )}
  >
    <motion.span
      className="absolute inset-0 bg-white/20"
      initial={{ scale: 0, opacity: 1 }}
      whileTap={{ scale: 4, opacity: 0 }}
      transition={{ duration: 0.5 }}
    />
    {children}
  </motion.button>
);

// Card Lift Effect
export const LiftCard = ({ children, className }: { children: ReactNode; className?: string }) => (
  <motion.div
    whileHover={{ 
      y: -4,
      boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)"
    }}
    transition={{ type: "spring", stiffness: 300, damping: 20 }}
    className={cn("rounded-lg", className)}
  >
    {children}
  </motion.div>
);

// Icon Bounce
export const BounceIcon = ({ children, className }: { children: ReactNode; className?: string }) => (
  <motion.div
    whileHover={{ 
      y: [0, -4, 0],
      transition: { duration: 0.3 }
    }}
    whileTap={{ scale: 0.9 }}
    className={className}
  >
    {children}
  </motion.div>
);

// Rotate on Hover
export const RotateOnHover = ({ 
  children, 
  degrees = 180,
  className 
}: { 
  children: ReactNode; 
  degrees?: number;
  className?: string;
}) => (
  <motion.div
    whileHover={{ rotate: degrees }}
    transition={{ duration: 0.3 }}
    className={className}
  >
    {children}
  </motion.div>
);
