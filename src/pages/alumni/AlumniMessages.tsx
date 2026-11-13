import { useAlumniStaffRecipients } from "@/queries/alumni";
import { useTranslation } from "react-i18next";
import { MessengerInterface } from "@/components/messages/MessengerInterface";

export default function AlumniMessages() {
  const { t } = useTranslation();
  // Get staff members for messaging using the sovereign API hook
  const { data: staffMembers } = useAlumniStaffRecipients();


  return (
    <MessengerInterface
      recipients={staffMembers || []}
      recipientLabel={t("alumniPortal.messages.recipient")}
      title={t("alumniPortal.messages.title")}
      showNewConversation={true}
    />
  );
}
