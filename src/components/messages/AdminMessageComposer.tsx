import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { useBulkNotifications } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { MessageSquarePlus, Send, Loader2, User } from "lucide-react";
import { toast } from "sonner";

type AppRole = string;

interface Recipient {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  roles: AppRole[];
}

export const AdminMessageComposer = () => {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const { StudentLabel } = useStudentLabel();
  const bulkNotify = useBulkNotifications();

  const ROLE_LABELS: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    TENANT_ADMIN: "Administrateur",
    DIRECTOR: "Directeur",
    TEACHER: "Enseignant",
    STUDENT: StudentLabel,
    PARENT: "Parent",
    ACCOUNTANT: "Comptable",
    STAFF: "Personnel",
  };

  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [recipientType, setRecipientType] = useState<"individual" | "role">("individual");
  const [selectedRole, setSelectedRole] = useState<AppRole | "">("");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const tenantId = tenant?.id;

  const { data: recipients } = useQuery({
    queryKey: ["message-recipients", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];

      const response = await apiClient.get<any[]>("/communication/messaging/users/");
      const profiles = response.data || [];

      return profiles
        .filter((p: any) => p.id !== user?.id)
        .map((profile: any) => ({
          id: profile.id,
          email: profile.email || '',
          first_name: profile.first_name || null,
          last_name: profile.last_name || null,
          roles: profile.roles || [],
        }));
    },
    enabled: !!tenantId && open,
  });

  const filteredRecipients = recipients?.filter((r) => {
    if (recipientType === "role" && selectedRole) {
      return r.roles.includes(selectedRole);
    }
    return true;
  });

  const toggleRecipient = (recipientId: string) => {
    setSelectedRecipients((prev) =>
      prev.includes(recipientId)
        ? prev.filter((id) => id !== recipientId)
        : [...prev, recipientId]
    );
  };

  const selectAllByRole = () => {
    if (selectedRole && filteredRecipients) {
      const roleRecipients = filteredRecipients
        .filter((r) => r.roles.includes(selectedRole))
        .map((r) => r.id);
      setSelectedRecipients(roleRecipients);
    }
  };

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId || !user?.id || selectedRecipients.length === 0) {
        throw new Error("Sélectionnez au moins un destinataire");
      }

      // Create a conversation
      const convRes = await apiClient.post("/communication/conversations/", {
        subject: subject || "Message de l'administration",
      });
      const conversation = convRes.data;

      // Send the message
      await apiClient.post(`/communication/conversations/${conversation.id}/messages/`, {
        content: message,
      });

      // Create notifications for all recipients
      const notifications = selectedRecipients.map((recipientId) => ({
        userId: recipientId,
        title: "Nouveau message",
        message: subject || "Vous avez reçu un nouveau message",
        type: "message" as const,
        link: tenant?.slug ? `/${tenant.slug}/teacher/messages` : "/teacher/messages",
      }));

      await bulkNotify.mutateAsync(notifications);

      return { count: selectedRecipients.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(`Message envoyé à ${data.count} personne(s)`);
      setOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erreur lors de l'envoi");
    },
  });

  const resetForm = () => {
    setRecipientType("individual");
    setSelectedRole("");
    setSelectedRecipients([]);
    setSubject("");
    setMessage("");
  };

  const handleSend = () => {
    if (selectedRecipients.length === 0) {
      toast.error("Veuillez sélectionner au moins un destinataire");
      return;
    }
    if (!message.trim()) {
      toast.error("Veuillez rédiger un message");
      return;
    }
    sendMessageMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <MessageSquarePlus className="w-4 h-4 mr-2" />
          Nouveau message
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Envoyer un message</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <Label>Type de destinataires</Label>
              <Select
                value={recipientType}
                onValueChange={(v: "individual" | "role") => {
                  setRecipientType(v);
                  setSelectedRecipients([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individuel</SelectItem>
                  <SelectItem value="role">Par rôle</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {recipientType === "role" && (
              <div className="flex-1 space-y-2">
                <Label>Rôle</Label>
                <Select value={selectedRole} onValueChange={(v: AppRole) => setSelectedRole(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un rôle" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TEACHER">Enseignants</SelectItem>
                    <SelectItem value="DIRECTOR">Directeurs</SelectItem>
                    <SelectItem value="STAFF">Personnel</SelectItem>
                    <SelectItem value="ACCOUNTANT">Comptables</SelectItem>
                    <SelectItem value="PARENT">Parents</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {recipientType === "role" && selectedRole && (
            <Button variant="outline" size="sm" onClick={selectAllByRole}>
              Sélectionner tous les {ROLE_LABELS[selectedRole].toLowerCase()}s
            </Button>
          )}

          <div className="space-y-2">
            <Label>Destinataires ({selectedRecipients.length} sélectionné(s))</Label>
            <ScrollArea className="h-40 border rounded-md p-2">
              {filteredRecipients?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Aucun destinataire disponible
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredRecipients?.map((recipient) => (
                    <div
                      key={recipient.id}
                      className="flex items-center gap-3 p-2 rounded hover:bg-muted cursor-pointer"
                      onClick={() => toggleRecipient(recipient.id)}
                    >
                      <Checkbox
                        checked={selectedRecipients.includes(recipient.id)}
                        onCheckedChange={() => toggleRecipient(recipient.id)}
                      />
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <User className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {recipient.first_name} {recipient.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {recipient.email}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {recipient.roles.slice(0, 2).map((role) => (
                          <Badge key={role} variant="outline" className="text-xs">
                            {ROLE_LABELS[role]}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <div className="space-y-2">
            <Label>Sujet</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Sujet du message (optionnel)"
            />
          </div>

          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Rédigez votre message..."
              rows={4}
            />
          </div>

          <Button
            className="w-full"
            onClick={handleSend}
            disabled={selectedRecipients.length === 0 || !message.trim() || sendMessageMutation.isPending}
          >
            {sendMessageMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Envoyer ({selectedRecipients.length})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
