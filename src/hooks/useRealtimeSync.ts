import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";

export const useRealtimeSync = () => {
    // SCALABILITY/MIGRATION: Realtime sync is disabled.
    // Future realtime updates will use the sovereign backend (WebSockets or Polling).
    return;
};
