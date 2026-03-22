import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Send, Loader2 } from "lucide-react";

interface HomeworkSubmissionDialogProps {
  homework: {
    id: string;
    title: string;
    description?: string | null;
    max_points?: number | null;
  };
  studentId: string;
  tenantId: string;
  existingSubmission?: {
    id: string;
    content: string | null;
    submitted_at: string | null;
    grade: number | null;
    feedback: string | null;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const HomeworkSubmissionDialog = ({
  homework,
  studentId,
  tenantId,
  existingSubmission,
  open,
  onOpenChange,
}: HomeworkSubmissionDialogProps) => {
  const queryClient = useQueryClient();
  const [content, setContent] = useState(existingSubmission?.content || "");

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (existingSubmission) {
        const { error } = await supabase
          .from("homework_submissions")
          .update({
            content,
            submitted_at: new Date().toISOString(),
          })
          .eq("id", existingSubmission.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("homework_submissions")
          .insert({
            homework_id: homework.id,
            student_id: studentId,
            tenant_id: tenantId,
            content,
            submitted_at: new Date().toISOString(),
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-submissions"] });
      toast.success("Devoir soumis avec succès");
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const isGraded = existingSubmission?.grade !== null && existingSubmission?.grade !== undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{homework.title}</DialogTitle>
          <DialogDescription>
            {homework.description || "Aucune description fournie"}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {isGraded && (
            <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
              <p className="font-semibold text-primary">
                Note: {existingSubmission?.grade}/{homework.max_points || 20}
              </p>
              {existingSubmission?.feedback && (
                <p className="text-sm mt-2 text-muted-foreground">
                  <span className="font-medium">Commentaire:</span> {existingSubmission.feedback}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Votre travail</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Rédigez votre travail ici..."
              rows={8}
              disabled={isGraded}
            />
            <p className="text-xs text-muted-foreground">
              {isGraded 
                ? "Ce devoir a été noté et ne peut plus être modifié."
                : "Vous pouvez modifier votre soumission jusqu'à ce qu'elle soit notée."
              }
            </p>
          </div>

          {!isGraded && (
            <Button 
              className="w-full" 
              onClick={() => submitMutation.mutate()}
              disabled={!content.trim() || submitMutation.isPending}
            >
              {submitMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              {existingSubmission ? "Modifier ma soumission" : "Soumettre mon travail"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HomeworkSubmissionDialog;
