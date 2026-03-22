import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface PresenceState {
  id: string;
  firstName: string;
  lastName: string;
  page: string;
  online_at: string;
}

interface RealtimePresenceProps {
  channelName: string;
  currentPage: string;
  maxAvatars?: number;
}

export const RealtimePresence = ({
  channelName,
  currentPage,
  maxAvatars = 5
}: RealtimePresenceProps) => {
  const { user, profile } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<PresenceState[]>([]);

  useEffect(() => {
    if (!user?.id || !profile) return;

    // SCALABILITY: Randomized jitter (0-5s) to prevent "thundering herd" connection storms
    const jitter = Math.floor(Math.random() * 5000);
    let channel: any = null;

    const timer = setTimeout(() => {
      channel = supabase.channel(channelName);

      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState() as Record<string, PresenceState[]>;
          const users: PresenceState[] = [];

          Object.keys(state).forEach((key) => {
            state[key].forEach((presence: any) => {
              // SCALABILITY: Hard limit on local presence list to avoid UI lag with 70k users
              if (presence.id !== user.id && users.length < 100) {
                users.push(presence);
              }
            });
          });

          setOnlineUsers(users);
        })
        .on("presence", { event: "join" }, ({ newPresences }) => {
          // Join logs disabled for performance in high-concurrency
        })
        .on("presence", { event: "leave" }, ({ leftPresences }) => {
          // Leave logs disabled for performance in high-concurrency
        })
        .subscribe(async (status: string) => {
          if (status === "SUBSCRIBED") {
            await channel.track({
              id: user.id,
              firstName: profile.first_name || "",
              lastName: profile.last_name || "",
              page: currentPage,
              online_at: new Date().toISOString(),
            });
          }
        });
    }, jitter);

    return () => {
      clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [user?.id, profile, channelName, currentPage]);


  const getInitials = (firstName?: string, lastName?: string) => {
    return `${firstName?.charAt(0) || ""}${lastName?.charAt(0) || ""}`.toUpperCase();
  };

  const displayedUsers = onlineUsers.slice(0, maxAvatars);
  const remainingCount = Math.max(0, onlineUsers.length - maxAvatars);

  if (onlineUsers.length === 0) return null;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="gap-1 text-xs">
          <Users className="w-3 h-3" />
          <span>{onlineUsers.length} en ligne</span>
        </Badge>
        <div className="flex -space-x-2">
          {displayedUsers.map((userPresence) => (
            <Tooltip key={userPresence.id}>
              <TooltipTrigger asChild>
                <Avatar className="h-7 w-7 border-2 border-background ring-2 ring-success ring-offset-1">
                  <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
                    {getInitials(userPresence.firstName, userPresence.lastName)}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">
                  {userPresence.firstName} {userPresence.lastName}
                </p>
                <p className="text-xs text-muted-foreground">
                  Sur: {userPresence.page}
                </p>
              </TooltipContent>
            </Tooltip>
          ))}
          {remainingCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="h-7 w-7 border-2 border-background">
                  <AvatarFallback className="text-[10px] bg-muted">
                    +{remainingCount}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>
                <p>{remainingCount} autres utilisateurs en ligne</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};
