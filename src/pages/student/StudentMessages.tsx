import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { MessengerInterface } from "@/components/messages/MessengerInterface";
import { studentsService } from "@/features/students/services/studentsService";

const StudentMessages = () => {
  const { user } = useAuth();
  const { tenant } = useTenant();

  // Fetch all potential recipients via studentsService
  const { data: recipients } = useQuery({
    queryKey: ["student-messaging-recipients", user?.id, tenant?.id],
    queryFn: () => studentsService.getMessagingRecipients(user?.id || "", tenant?.id || ""),
    enabled: !!user?.id && !!tenant?.id,
  });

  return (
    <MessengerInterface
      recipients={recipients || []}
      recipientLabel="Destinataire"
      title="Messages"
      showNewConversation={true}
    />
  );
};

export default StudentMessages;
