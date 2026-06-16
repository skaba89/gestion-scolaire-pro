import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { MessengerInterface } from "@/components/messages/MessengerInterface";

import { parentsService } from "@/features/parents/services/parentsService";

const Messages = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { tenant } = useTenant();

  // Fetch teachers via parentsService
  const { data: teachers } = useQuery({
    queryKey: ["parent-children-teachers", user?.id, tenant?.id],
    queryFn: () => parentsService.getChildrenTeachers(user?.id || "", tenant?.id || ""),
    enabled: !!user?.id && !!tenant?.id,
  });

  return (
    <MessengerInterface
      recipients={teachers || []}
      recipientLabel={t("appointments.teacher")}
      title={t("nav.messages")}
      showNewConversation={true}
    />
  );
};

export default Messages;
