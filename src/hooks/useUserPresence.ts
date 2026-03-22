import { useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";

export const useUserPresence = (currentConversationId?: string | null) => {
  const { user } = useAuth();
  const { tenant } = useTenant();

  const updatePresence = useCallback(async (isOnline: boolean, isTyping = false, conversationId?: string | null) => {
    if (!user?.id || !tenant?.id) return;

    try {
      const { error } = await supabase
        .from("user_presence")
        .upsert({
          user_id: user.id,
          is_online: isOnline,
          last_seen_at: new Date().toISOString(),
          current_conversation_id: conversationId || null,
          is_typing: isTyping,
          tenant_id: tenant.id,
        }, { onConflict: "user_id" });

      if (error) console.error("Error updating presence:", error);
    } catch (err) {
      console.error("Failed to update presence:", err);
    }
  }, [user?.id, tenant?.id]);

  const setTyping = useCallback(async (isTyping: boolean) => {
    if (!user?.id || !currentConversationId) return;

    try {
      await supabase
        .from("user_presence")
        .upsert({
          user_id: user.id,
          is_typing: isTyping,
          current_conversation_id: currentConversationId,
          last_seen_at: new Date().toISOString(),
          tenant_id: tenant?.id,
        }, { onConflict: "user_id" });
    } catch (err) {
      console.error("Failed to update typing status:", err);
    }
  }, [user?.id, tenant?.id, currentConversationId]);

  // Set online status when component mounts
  useEffect(() => {
    if (!user?.id || !tenant?.id) return;

    // Set online
    updatePresence(true, false, currentConversationId);

    // Update presence periodically
    const interval = setInterval(() => {
      updatePresence(true, false, currentConversationId);
    }, 30000); // Every 30 seconds

    // Handle visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        updatePresence(true, false, currentConversationId);
      } else {
        updatePresence(false, false, currentConversationId);
      }
    };

    // Handle before unload
    const handleBeforeUnload = () => {
      updatePresence(false, false, null);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      updatePresence(false, false, null);
    };
  }, [user?.id, tenant?.id, currentConversationId, updatePresence]);

  return { setTyping, updatePresence };
};
