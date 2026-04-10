import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";

interface TypingIndicatorProps {
  conversationId: string;
}

export function TypingIndicator({ conversationId }: TypingIndicatorProps) {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const [typingUsers, setTypingUsers] = useState<{ first_name: string; last_name: string }[]>([]);

  const { data: participants } = useQuery({
    queryKey: ["conversation-participants", conversationId],
    queryFn: async () => {
      const response = await apiClient.get<any[]>(`/communication/conversations/${conversationId}/participants/`);
      return response.data
        ?.map((p: any) => p.user_id)
        .filter((id: string) => id !== user?.id) || [];
    },
    enabled: !!conversationId && !!user?.id,
  });

  const { data: typingPresence } = useQuery({
    queryKey: ["typing-presence", conversationId, participants],
    queryFn: async () => {
      if (!conversationId || !participants?.length) return null;

      const response = await apiClient.get<any[]>("/communication/presence/", {
        params: {
          conversation_id: conversationId,
          is_typing: true,
          user_ids: participants,
        }
      });
      const presenceData = response.data || [];

      if (presenceData.length) {
        const userIds = presenceData.map((d: any) => d.user_id);
        const profilesRes = await apiClient.get<any[]>("/users/", {
          params: { ids: userIds }
        });
        return profilesRes.data || [];
      }
      return [];
    },
    enabled: !!conversationId && !!participants?.length,
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (typingPresence) {
      setTypingUsers(typingPresence);
    } else {
      setTypingUsers([]);
    }
  }, [typingPresence]);

  if (typingUsers.length === 0) return null;

  const names = typingUsers.map(u => u.first_name);
  const displayText = names.length === 1 
    ? `${names[0]} est en train d'écrire...`
    : names.length === 2
    ? `${names[0]} et ${names[1]} sont en train d'écrire...`
    : `${names.length} personnes sont en train d'écrire...`;

  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <div className="flex items-center gap-1 h-6 px-3 bg-muted/50 rounded-full">
        <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "0ms", animationDuration: "0.8s" }} />
        <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "200ms", animationDuration: "0.8s" }} />
        <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "400ms", animationDuration: "0.8s" }} />
      </div>
      <span className="text-sm text-muted-foreground italic">
        {displayText}
      </span>
    </div>
  );
}
