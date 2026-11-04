import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";

interface TypingIndicatorProps {
  conversationId: string;
}

export function TypingIndicator({ conversationId }: TypingIndicatorProps) {
  const { user } = useAuth();

  // Une seule requête : le serveur renvoie les participants (autres que moi)
  // qui écrivent en ce moment, avec leur prénom. Auparavant : routes
  // « participants » et « presence » inexistantes, puis GET /users/ (interdit
  // aux élèves et aux parents) — l'indicateur ne s'affichait jamais.
  const { data: typingUsers = [] } = useQuery({
    queryKey: ["typing-presence", conversationId],
    queryFn: async () => {
      const { data } = await apiClient.get<{ user_id: string; first_name: string }[]>(
        `/communication/conversations/${conversationId}/typing/`,
      );
      return (data || []).filter((u) => u.user_id !== user?.id);
    },
    enabled: !!conversationId && !!user?.id,
    refetchInterval: 3000,
  });

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
