import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SmilePlus } from "lucide-react";
import { toast } from "sonner";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

interface MessageReactionsProps {
  messageId: string;
  compact?: boolean;
}

export function MessageReactions({ messageId, compact = false }: MessageReactionsProps) {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: reactions } = useQuery({
    queryKey: ["message-reactions", messageId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_reactions")
        .select("emoji, user_id")
        .eq("message_id", messageId);
      
      if (error) throw error;
      
      // Group reactions by emoji
      const grouped: Record<string, string[]> = {};
      data?.forEach((r) => {
        if (!grouped[r.emoji]) grouped[r.emoji] = [];
        grouped[r.emoji].push(r.user_id);
      });
      
      return grouped;
    },
    enabled: !!messageId,
  });

  const addReactionMutation = useMutation({
    mutationFn: async (emoji: string) => {
      const { error } = await supabase
        .from("message_reactions")
        .insert({
          message_id: messageId,
          user_id: user?.id,
          emoji,
          tenant_id: tenant?.id ?? "",
        });

      if (error) {
        if (error.code === "23505") {
          // Already exists, remove it
          await supabase
            .from("message_reactions")
            .delete()
            .eq("message_id", messageId)
            .eq("user_id", user?.id)
            .eq("emoji", emoji);
        } else {
          throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["message-reactions", messageId] });
    },
    onError: () => {
      toast.error("Erreur lors de l'ajout de la réaction");
    },
  });

  const handleReaction = (emoji: string) => {
    addReactionMutation.mutate(emoji);
    setOpen(false);
  };

  const hasReactions = reactions && Object.keys(reactions).length > 0;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {hasReactions && Object.entries(reactions).map(([emoji, userIds]) => (
        <button
          key={emoji}
          onClick={() => handleReaction(emoji)}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs transition-colors ${
            userIds.includes(user?.id || "") 
              ? "bg-primary/20 text-primary border border-primary/30" 
              : "bg-muted hover:bg-muted/80"
          }`}
        >
          <span>{emoji}</span>
          <span className="text-muted-foreground">{userIds.length}</span>
        </button>
      ))}
      
      {!compact && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
              <SmilePlus className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="flex gap-1">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleReaction(emoji)}
                  className="p-1.5 hover:bg-muted rounded-md text-lg transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
