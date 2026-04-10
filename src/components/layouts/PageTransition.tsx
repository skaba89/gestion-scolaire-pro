import { motion } from "framer-motion";
import { ReactNode, CSSProperties } from "react";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

const pageVariants = {
  initial: {
    opacity: 0,
    y: 20,
    scale: 0.98,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.98,
  },
};

const pageTransition = {
  duration: 0.4,
  ease: [0.22, 1, 0.36, 1], // Premium easing
};

export const PageTransition = ({ children, className = "", style }: PageTransitionProps) => {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
      transition={pageTransition}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
};

// Tab content animation
export const TabTransition = ({ children, className = "", style }: PageTransitionProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
};

// Card stagger animation for lists
export const StaggerContainer = ({
  children,
  className = "",
  style,
  as = "div"
}: PageTransitionProps & { as?: any }) => {
  const Component = motion[as as keyof typeof motion] || motion.div;

  return (
    <Component
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: 0.1,
          },
        },
      }}
      className={className}
      style={style}
    >
      {children}
    </Component>
  );
};

export const StaggerItem = ({
  children,
  className = "",
  style,
  as = "div"
}: PageTransitionProps & { as?: any }) => {
  const Component = motion[as as keyof typeof motion] || motion.div;

  return (
    <Component
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={className}
      style={style}
    >
      {children}
    </Component>
  );
};
