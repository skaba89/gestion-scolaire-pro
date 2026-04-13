/**
 * useRealtimeMessages — Polling-based replacement for Supabase Realtime.
 * Polls GET /communication/messaging/poll every 5 seconds for new messages.
 * Replaces the Supabase channel subscription.
 */
import { useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";

const POLL_INTERVAL_MS = 5000; // 5 seconds

export const useRealtimeMessages = () => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const lastSeenRef = useRef<string>(new Date().toISOString());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    if (!user?.id || !currentTenant?.id) return;

    try {
      const { data } = await apiClient.get("/communication/messaging/poll", {
        params: { since: lastSeenRef.current }
      });

      const newMessages: Array<{
        id: string;
        content: string;
        created_at: string;
        sender_id: string;
        conversation_id: string;
        sender_name: string;
      }> = data || [];

      if (newMessages.length > 0) {
        // Update the timestamp to the latest message
        const latest = newMessages[newMessages.length - 1];
        lastSeenRef.current = latest.created_at;

        // Show toast for each new message (from others)
        newMessages.forEach((msg) => {
          toast.info("Nouveau message", {
            description: `${msg.sender_name || "Quelqu'un"}: ${msg.content.substring(0, 60)}${msg.content.length > 60 ? "..." : ""}`,
            action: {
              label: "Voir",
              onClick: () => {
                // Navigate to messages page
                if (currentTenant?.slug) {
                  navigate(`/${currentTenant.slug}/messages`);
                }
              },
            },
            duration: 4000,
          });
        });

        // Invalidate queries to refresh UI
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        queryClient.invalidateQueries({ queryKey: ["messages"] });
      }
    } catch {
      // Silently fail — don't spam errors for polling
    }
  }, [user?.id, currentTenant?.id, currentTenant?.slug, queryClient]);

  useEffect(() => {
    if (!user?.id) return;

    // Reset last seen on mount
    lastSeenRef.current = new Date().toISOString();

    // Start polling
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [user?.id, poll]);
};
