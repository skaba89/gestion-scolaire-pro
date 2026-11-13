import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { homeworkService } from "@/features/homework/services/homeworkService";
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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [content, setContent] = useState(existingSubmission?.content || "");

  useEffect(() => {
    setContent(existingSubmission?.content || "");
  }, [homework.id, existingSubmission?.id, existingSubmission?.content, open]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (existingSubmission) {
        await homeworkService.updateSubmission(homework.id, existingSubmission.id, tenantId, content);
      } else {
        await homeworkService.submitHomework(homework.id, studentId, tenantId, { content });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-submissions"] });
      toast.success(t("homeworkSubmission.success"));
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || error.message);
    },
  });

  const isGraded = existingSubmission?.grade !== null && existingSubmission?.grade !== undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{homework.title}</DialogTitle>
          <DialogDescription>
            {homework.description || t("homeworkSubmission.noDescription")}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {isGraded && (
            <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
              <p className="font-semibold text-primary">
                {t("homeworkSubmission.grade", { grade: existingSubmission?.grade, max: homework.max_points || 20 })}
              </p>
              {existingSubmission?.feedback && (
                <p className="text-sm mt-2 text-muted-foreground">
                  <span className="font-medium">{t("homeworkSubmission.comment")}</span> {existingSubmission.feedback}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="homework-submission-content">{t("homeworkSubmission.yourWork")}</Label>
            <Textarea
              id="homework-submission-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("homeworkSubmission.placeholder")}
              rows={8}
              disabled={isGraded}
            />
            <p className="text-xs text-muted-foreground">
              {isGraded 
                ? t("homeworkSubmission.graded")
                : t("homeworkSubmission.editable")
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
              {existingSubmission ? t("homeworkSubmission.update") : t("homeworkSubmission.submit")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HomeworkSubmissionDialog;
