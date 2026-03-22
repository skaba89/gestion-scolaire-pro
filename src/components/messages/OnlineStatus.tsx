import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface OnlineStatusProps {
  userId: string;
  showLastSeen?: boolean;
  size?: "sm" | "md" | "lg";
  showBadge?: boolean;
}

export function OnlineStatus({ 
  userId, 
  showLastSeen = false,
  size = "md",
  showBadge = false 
}: OnlineStatusProps) {
  const { data: presence } = useQuery({
    queryKey: ["user-presence", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_presence")
        .select("is_online, last_seen_at")
        .eq("user_id", userId)
        .single();
      
      return data;
    },
    enabled: !!userId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Consider user online if last seen within 2 minutes
  const isOnline = presence?.is_online && presence?.last_seen_at && 
    new Date(presence.last_seen_at) > new Date(Date.now() - 2 * 60 * 1000);

  const sizeClasses = {
    sm: "w-2 h-2",
    md: "w-2.5 h-2.5",
    lg: "w-3.5 h-3.5"
  };

  const ringClasses = {
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4",
    lg: "w-5 h-5"
  };

  if (showBadge) {
    return (
      <div className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs",
        isOnline 
          ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" 
          : "bg-muted text-muted-foreground"
      )}>
        <span className={cn(
          "rounded-full",
          sizeClasses[size],
          isOnline ? "bg-emerald-500" : "bg-muted-foreground/40"
        )} />
        {isOnline ? "En ligne" : showLastSeen && presence?.last_seen_at
          ? `Vu ${formatDistanceToNow(new Date(presence.last_seen_at), { addSuffix: true, locale: fr })}`
          : "Hors ligne"
        }
      </div>
    );
  }

  if (showLastSeen && !isOnline && presence?.last_seen_at) {
    return (
      <span className="text-xs text-muted-foreground">
        Vu {formatDistanceToNow(new Date(presence.last_seen_at), { addSuffix: true, locale: fr })}
      </span>
    );
  }

  return (
    <span className="relative inline-flex" title={isOnline ? "En ligne" : "Hors ligne"}>
      {isOnline && (
        <motion.span
          className={cn(
            "absolute inset-0 rounded-full bg-emerald-500/50",
            ringClasses[size]
          )}
          initial={{ scale: 1, opacity: 0.5 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <span 
        className={cn(
          "rounded-full relative z-10",
          sizeClasses[size],
          isOnline 
            ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" 
            : "bg-muted-foreground/40"
        )}
      />
    </span>
  );
}
