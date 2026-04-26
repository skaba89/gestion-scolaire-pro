import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { MessengerInterface } from "@/components/messages/MessengerInterface";
import { studentsService } from "@/features/students/services/studentsService";

const StudentMessages = () => {
  const { t } = useTranslation();
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
      title={t("nav.messages")}
      showNewConversation={true}
    />
  );
};

export default StudentMessages;
