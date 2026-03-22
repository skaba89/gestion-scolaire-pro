import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import { Users, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useBulkNotifications } from "@/hooks/useNotifications";

export const GroupMessageComposer = () => {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const bulkNotify = useBulkNotifications();
  const [open, setOpen] = useState(false);
  const [selectedClassroom, setSelectedClassroom] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const { data: classrooms } = useQuery({
    queryKey: ["teacher-classrooms-for-message", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from("classrooms")
        .select("id, name")
        .eq("tenant_id", tenant.id)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const { data: parentCount } = useQuery({
    queryKey: ["classroom-parents-count", selectedClassroom],
    queryFn: async () => {
      if (!selectedClassroom) return 0;

      // Get students in classroom
      const { data: enrollments, error: enrollError } = await supabase
        .from("enrollments")
        .select("student_id")
        .eq("class_id", selectedClassroom)
        .eq("status", "active");

      if (enrollError) throw enrollError;
      if (!enrollments?.length) return 0;

      const studentIds = enrollments.map(e => e.student_id);

      // Get parents of these students
      const { data: parentStudents, error: parentError } = await supabase
        .from("parent_students")
        .select("parent_id")
        .in("student_id", studentIds);

      if (parentError) throw parentError;

      // Unique parents
      const uniqueParents = new Set(parentStudents?.map(p => p.parent_id));
      return uniqueParents.size;
    },
    enabled: !!selectedClassroom,
  });

  const sendGroupMessageMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id || !user?.id || !selectedClassroom) {
        throw new Error("Données manquantes");
      }

      // Get students in classroom
      const { data: enrollments, error: enrollError } = await supabase
        .from("enrollments")
        .select("student_id")
        .eq("class_id", selectedClassroom)
        .eq("status", "active");

      if (enrollError) throw enrollError;
      if (!enrollments?.length) throw new Error("Aucun élève dans cette classe");

      const studentIds = enrollments.map(e => e.student_id);

      // Get parents of these students
      const { data: parentStudents, error: parentError } = await supabase
        .from("parent_students")
        .select("parent_id")
        .in("student_id", studentIds);

      if (parentError) throw parentError;
      if (!parentStudents?.length) throw new Error("Aucun parent associé à cette classe");

      const uniqueParentIds = [...new Set(parentStudents.map(p => p.parent_id))];

      // Create a conversation
      const { data: conversation, error: convError } = await supabase
        .from("conversations")
        .insert({
          tenant_id: tenant.id,
          subject: subject || "Message de l'enseignant",
        })
        .select()
        .single();

      if (convError) throw convError;

      // Add all parents and the teacher as participants
      const participants = [
        { conversation_id: conversation.id, user_id: user.id },
        ...uniqueParentIds.map(parentId => ({
          conversation_id: conversation.id,
          user_id: parentId,
        })),
      ];

      const { error: partError } = await supabase
        .from("conversation_participants")
        .insert(participants);

      if (partError) throw partError;

      // Send the message
      const { error: msgError } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversation.id,
          sender_id: user.id,
          content: message,
          tenant_id: tenant.id,
        });

      if (msgError) throw msgError;

      // Create notifications for all parents
      const notifications = uniqueParentIds.map(parentId => ({
        userId: parentId,
        title: "Nouveau message de l'enseignant",
        message: subject || "Vous avez reçu un message groupé",
        type: "message" as const,
        link: tenant?.slug ? `/${tenant.slug}/parent/messages` : "/parent/messages",
      }));

      await bulkNotify.mutateAsync(notifications);

      return { count: uniqueParentIds.length };
    },
    onSuccess: (data) => {
      toast.success(`Message envoyé à ${data.count} parent(s)`);
      setOpen(false);
      setSelectedClassroom("");
      setSubject("");
      setMessage("");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erreur lors de l'envoi");
    },
  });

  const handleSend = () => {
    if (!selectedClassroom || !message.trim()) {
      toast.error("Veuillez sélectionner une classe et rédiger un message");
      return;
    }
    sendGroupMessageMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Users className="w-4 h-4 mr-2" />
          Message groupé
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Envoyer un message à tous les parents</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Classe</Label>
            <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner une classe" />
              </SelectTrigger>
              <SelectContent>
                {classrooms?.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {parentCount !== undefined && selectedClassroom && (
              <p className="text-xs text-muted-foreground">
                {parentCount} parent(s) recevront ce message
              </p>
            )}
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
              rows={5}
            />
          </div>

          <Button
            className="w-full"
            onClick={handleSend}
            disabled={!selectedClassroom || !message.trim() || sendGroupMessageMutation.isPending}
          >
            {sendGroupMessageMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Envoyer à tous les parents
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
