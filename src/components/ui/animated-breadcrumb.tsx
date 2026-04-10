import { ChevronRight, Home } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface AnimatedBreadcrumbProps {
  items?: BreadcrumbItem[];
  homeHref?: string;
}

export const AnimatedBreadcrumb = ({ 
  items = [], 
  homeHref = "/" 
}: AnimatedBreadcrumbProps) => {
  const { t } = useTranslation();
  const location = useLocation();
  
  // Auto-generate breadcrumbs from path if not provided
  const pathSegments = location.pathname.split('/').filter(Boolean);
  
  const breadcrumbItems = items.length > 0 ? items : pathSegments.map((segment, index) => ({
    label: t(`nav.${segment}`, segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ')),
    href: index < pathSegments.length - 1 ? `/${pathSegments.slice(0, index + 1).join('/')}` : undefined
  }));

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.05
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -10 },
    visible: { 
      opacity: 1, 
      x: 0,
      transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as const }
    }
  };

  const chevronVariants = {
    hidden: { opacity: 0, scale: 0.5 },
    visible: { 
      opacity: 1, 
      scale: 1,
      transition: { duration: 0.2 }
    }
  };

  return (
    <motion.nav
      className="flex items-center space-x-1 text-sm text-muted-foreground"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      aria-label="Breadcrumb"
    >
      {/* Home icon */}
      <motion.div variants={itemVariants}>
        <Link
          to={homeHref}
          className="flex items-center p-1.5 rounded-md transition-all duration-200 hover:bg-muted hover:text-foreground hover:scale-105"
        >
          <Home className="h-4 w-4" />
        </Link>
      </motion.div>

      {breadcrumbItems.map((item, index) => (
        <div key={index} className="flex items-center">
          <motion.div variants={chevronVariants}>
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
          </motion.div>
          
          <motion.div variants={itemVariants}>
            {item.href ? (
              <Link
                to={item.href}
                className="px-2 py-1 rounded-md transition-all duration-200 hover:bg-muted hover:text-foreground hover:scale-105"
              >
                {item.label}
              </Link>
            ) : (
              <span className="px-2 py-1 font-medium text-foreground">
                {item.label}
              </span>
            )}
          </motion.div>
        </div>
      ))}
    </motion.nav>
  );
};
