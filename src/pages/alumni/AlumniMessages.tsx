import { useAlumniStaffRecipients } from "@/queries/alumni";
import { MessengerInterface } from "@/components/messages/MessengerInterface";

export default function AlumniMessages() {
  // Get staff members for messaging using the sovereign API hook
  const { data: staffMembers } = useAlumniStaffRecipients();


  return (
    <MessengerInterface
      recipients={staffMembers || []}
      recipientLabel="Destinataire"
      title="Messages"
      showNewConversation={true}
    />
  );
}
