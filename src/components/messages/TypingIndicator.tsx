import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
      const { data } = await supabase
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", conversationId)
        .neq("user_id", user?.id);
      
      return data?.map(p => p.user_id) || [];
    },
    enabled: !!conversationId && !!user?.id,
  });

  useEffect(() => {
    if (!conversationId || !tenant?.id || !participants?.length) return;

    const fetchTypingUsers = async () => {
      const { data } = await supabase
        .from("user_presence")
        .select("user_id")
        .eq("current_conversation_id", conversationId)
        .eq("is_typing", true)
        .in("user_id", participants);

      if (data?.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .in("id", data.map(d => d.user_id));
        
        setTypingUsers(profiles || []);
      } else {
        setTypingUsers([]);
      }
    };

    fetchTypingUsers();

    const channel = supabase
      .channel(`typing-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_presence",
          filter: `current_conversation_id=eq.${conversationId}`,
        },
        () => {
          fetchTypingUsers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, tenant?.id, participants]);

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
