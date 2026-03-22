import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTenant } from "@/contexts/TenantContext";

interface NavItemProps {
  href: string;
  label: string;
  icon: any;
  isActive: boolean;
}

const NavItem = ({ href, label, icon: Icon, isActive }: NavItemProps) => (
  <Link
    to={href}
    className={cn(
      "flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors relative",
      isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
    )}
  >
    <Icon className={cn("h-5 w-5", isActive && "animate-in zoom-in-75 duration-300")} />
    <span className="text-[10px] font-medium leading-none">{label}</span>
    {isActive && (
      <span className="absolute top-1 w-1 h-1 bg-primary rounded-full" />
    )}
  </Link>
);

interface MobileBottomNavProps {
  items: {
    href: string;
    label: string;
    icon: any;
  }[];
}

export const MobileBottomNav = ({ items }: MobileBottomNavProps) => {
  const location = useLocation();
  const { tenant } = useTenant();

  if (!tenant) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-background/80 backdrop-blur-lg border-t z-50 flex items-center justify-around px-2 lg:hidden safe-area-bottom shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
      {items.map((item) => {
        const isActive = location.pathname === item.href || (item.href !== `/${tenant.slug}/admin` && location.pathname.startsWith(item.href));
        return (
          <NavItem
            key={item.href}
            {...item}
            isActive={isActive}
          />
        );
      })}
    </nav>
  );
};
