/**
 * DepartmentMessages — Migré pour utiliser le MessengerInterface souverain.
 * Les recipients sont chargés via /communication/messaging/teacher-recipients (déjà souverain).
 */
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { MessengerInterface } from "@/components/messages/MessengerInterface";
import { useAuth } from "@/contexts/AuthContext";

export default function DepartmentMessages() {
  const { user } = useAuth();

  // Load department teachers as messaging recipients via the sovereign API
  const { data: recipients } = useQuery({
    queryKey: ["department-messaging-recipients"],
    queryFn: async () => {
      const { data } = await apiClient.get("/communication/messaging/teacher-recipients");
      return data || [];
    },
    enabled: !!user?.id,
  });

  return (
    <MessengerInterface
      recipients={recipients || []}
      recipientLabel="Enseignant"
      title="Messages"
      showNewConversation={true}
    />
  );
}
