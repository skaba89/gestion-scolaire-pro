import { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { Send, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useStudentLabel } from "@/hooks/useStudentLabel";

type AppRole = string;

interface Recipient {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  roles: AppRole[];
}

export default function ExternalMessageComposer() {
  const { tenant } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const { StudentLabel } = useStudentLabel();

  const ROLE_LABELS: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    TENANT_ADMIN: "Administrateur",
    DIRECTOR: "Directeur",
    DEPARTMENT_HEAD: "Chef de Département",
    TEACHER: "Enseignant",
    STUDENT: StudentLabel,
    PARENT: "Parent",
    ACCOUNTANT: "Comptable",
    STAFF: "Secrétariat",
  };

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [sending, setSending] = useState(false);
  const [recipientFilter, setRecipientFilter] = useState<string>("all");

  const tenantId = tenant?.id;

  useEffect(() => {
    const fetchRecipients = async () => {
      if (!tenantId) return;
      setLoading(true);

      try {
        const profilesRes = await apiClient.get<any[]>("/communication/messaging/users/");
        const profiles = profilesRes.data || [];

        const recipientsWithRoles: Recipient[] = profiles
          .filter((p: any) => p.id !== user?.id)
          .map((profile: any) => ({
            id: profile.id,
            email: profile.email || '',
            first_name: profile.first_name || null,
            last_name: profile.last_name || null,
            roles: profile.roles || [],
          }));

        setRecipients(recipientsWithRoles);
      } catch (error) {
        console.error("Error fetching recipients:", error);
        setRecipients([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRecipients();
  }, [tenantId, user?.id]);

  const filteredRecipients = recipients.filter(r => {
    if (recipientFilter === "all") return true;
    return r.roles.includes(recipientFilter as AppRole);
  });

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedRecipients(filteredRecipients.map(r => r.id));
    } else {
      setSelectedRecipients([]);
    }
  };

  const handleToggleRecipient = (id: string) => {
    setSelectedRecipients(prev =>
      prev.includes(id)
        ? prev.filter(r => r !== id)
        : [...prev, id]
    );
  };

  const handleSend = async () => {
    if (!subject.trim() || !message.trim() || selectedRecipients.length === 0) {
      toast({
        title: "Erreur",
        description: "Veuillez remplir tous les champs et sélectionner au moins un destinataire",
        variant: "destructive",
      });
      return;
    }

    setSending(true);

    try {
      const recipientEmails = recipients
        .filter(r => selectedRecipients.includes(r.id))
        .map(r => ({
          email: r.email,
          name: `${r.first_name || ""} ${r.last_name || ""}`.trim(),
        }));

      await apiClient.post("/communication/send-notification-email/", {
        recipients: recipientEmails,
        subject,
        message,
        tenant_name: tenant?.name || "SchoolFlow Pro",
      });

      toast({
        title: "Succès",
        description: `Email envoyé à ${recipientEmails.length} destinataire(s)`,
      });

      // Reset form
      setSubject("");
      setMessage("");
      setSelectedRecipients([]);
      setSelectAll(false);
    } catch (error: any) {
      console.error("Error sending email:", error);
      toast({
        title: "Erreur",
        description: error.message || "Impossible d'envoyer l'email",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const uniqueRoles = [...new Set(recipients.flatMap(r => r.roles))];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Objet *</Label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Objet de l'email..."
        />
      </div>

      <div className="space-y-2">
        <Label>Message *</Label>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Votre message..."
          rows={5}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Label>Destinataires ({selectedRecipients.length} sélectionné(s))</Label>
          <div className="flex items-center gap-4">
            <Select value={recipientFilter} onValueChange={setRecipientFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filtrer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {uniqueRoles.map(role => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABELS[role] || role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Checkbox
                id="selectAll"
                checked={selectAll}
                onCheckedChange={(checked) => handleSelectAll(!!checked)}
              />
              <label htmlFor="selectAll" className="text-sm cursor-pointer">
                Tout sélectionner
              </label>
            </div>
          </div>
        </div>

        <ScrollArea className="h-[200px] border rounded-lg">
          {filteredRecipients.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              Aucun destinataire disponible
            </div>
          ) : (
            <div className="divide-y">
              {filteredRecipients.map((recipient) => (
                <div
                  key={recipient.id}
                  className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer"
                  onClick={() => handleToggleRecipient(recipient.id)}
                >
                  <Checkbox
                    checked={selectedRecipients.includes(recipient.id)}
                    onCheckedChange={() => handleToggleRecipient(recipient.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {recipient.first_name} {recipient.last_name}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      {recipient.email}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {recipient.roles.slice(0, 2).map((role) => (
                      <span key={role} className="text-xs bg-muted px-2 py-1 rounded">
                        {ROLE_LABELS[role] || role}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <Button
        onClick={handleSend}
        disabled={sending || selectedRecipients.length === 0 || !subject.trim() || !message.trim()}
        className="w-full"
      >
        {sending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Envoi en cours...
          </>
        ) : (
          <>
            <Send className="h-4 w-4 mr-2" />
            Envoyer ({selectedRecipients.length} destinataire{selectedRecipients.length > 1 ? "s" : ""})
          </>
        )}
      </Button>
    </div>
  );
}
