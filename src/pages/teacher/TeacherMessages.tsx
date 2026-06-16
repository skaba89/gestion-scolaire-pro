import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { MessengerInterface } from "@/components/messages/MessengerInterface";
import { communicationQueries } from "@/queries/communication";

const TeacherMessages = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { tenant } = useTenant();

  // Use centralized query for messaging recipients
  const { data: recipients } = useQuery({
    ...communicationQueries.teacherMessagingRecipients(user?.id || "", tenant?.id || ""),
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

export default TeacherMessages;
