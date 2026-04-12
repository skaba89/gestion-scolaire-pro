import { useTenant } from "@/contexts/TenantContext";
import { useSetting } from "@/hooks/useSettings";
import { resolveUploadUrl } from "@/utils/url";
import { GraduationCap } from "lucide-react";

interface TenantBrandingProps {
  showName?: boolean;
  subtitle?: string;
  size?: "sm" | "md" | "lg";
}

export function TenantBranding({ showName = true, subtitle, size = "md" }: TenantBrandingProps) {
  const { tenant } = useTenant();

  // Get dynamic branding settings with fallback to tenant data
  const logo_url = useSetting("logo_url", tenant?.logo_url);
  const name = useSetting("name", tenant?.name || "Mon Établissement");
  const show_logo_text = useSetting("show_logo_text", true);

  const sizeClasses = {
    sm: {
      logo: "w-8 h-8",
      icon: "w-5 h-5",
      title: "text-sm font-semibold",
      subtitle: "text-[10px]",
    },
    md: {
      logo: "w-10 h-10",
      icon: "w-6 h-6",
      title: "text-base font-bold",
      subtitle: "text-xs",
    },
    lg: {
      logo: "w-14 h-14",
      icon: "w-8 h-8",
      title: "text-xl font-bold",
      subtitle: "text-sm",
    },
  };

  const classes = sizeClasses[size];

  return (
    <div className="flex items-center gap-3">
      {logo_url ? (
        <img
          src={resolveUploadUrl(logo_url)}
          alt={name || "Logo"}
          className={`${classes.logo} rounded-xl object-contain`}
        />
      ) : (
        <div className={`${classes.logo} rounded-xl bg-gradient-primary flex items-center justify-center`}>
          <GraduationCap className={`${classes.icon} text-primary-foreground`} />
        </div>
      )}
      {showName && show_logo_text && (
        <div>
          {subtitle && (
            <p className={`${classes.subtitle} text-muted-foreground`}>{subtitle}</p>
          )}
          <p className="text-[10px] text-muted-foreground/50 italic mt-1 font-light tracking-tight">{name}</p>
        </div>
      )}
    </div>
  );
}
