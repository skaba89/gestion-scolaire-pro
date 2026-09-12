// Realtime presence disabled — migrated from supabase.channel()
// The presence feature relied on Supabase Realtime and has been disabled.
// Imports and the internal PresenceState type were removed as dead code
// (the component is a `return null` stub); the props interface is kept so
// existing call sites remain source-compatible.

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
