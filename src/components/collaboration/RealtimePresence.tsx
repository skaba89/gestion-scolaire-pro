import { useState } from "react";
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

// Realtime presence disabled — migrated from supabase.channel()
// The presence feature relied on Supabase Realtime and has been disabled.

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
  // Realtime presence is disabled — early return
  // This component relied on supabase.channel() for presence tracking
  return null;
};
