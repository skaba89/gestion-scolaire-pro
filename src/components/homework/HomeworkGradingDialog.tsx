import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Users,
  CheckCircle,
  Clock,
  Save,
  Loader2,
  FileText
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useStudentLabel } from "@/hooks/useStudentLabel";

interface HomeworkGradingDialogProps {
  homework: {
    id: string;
    title: string;
    class_id: string;
    max_points: number | null;
  };
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const HomeworkGradingDialog = ({
  homework,
  tenantId,
  open,
  onOpenChange,
}: HomeworkGradingDialogProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { studentLabel, StudentLabel, studentsLabel } = useStudentLabel();
  const [gradingData, setGradingData] = useState<Record<string, { grade: string; feedback: string }>>({});

  // Get students in classroom
  const { data: students } = useQuery({
    queryKey: ["classroom-students-grading", homework.class_id],
    queryFn: async () => {
      const { data: enrollments, error } = await supabase
        .from("enrollments")
        .select("student:students(id, first_name, last_name)")
        .eq("class_id", homework.class_id)
        .eq("status", "active");

      if (error) throw error;
      return enrollments?.map(e => e.student).filter(Boolean) || [];
    },
    enabled: open && !!homework.class_id,
  });

  // Get submissions for this homework
  const { data: submissions, isLoading } = useQuery({
    queryKey: ["homework-submissions-grading", homework.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("homework_submissions")
        .select("*")
        .eq("homework_id", homework.id);
      if (error) throw error;
      return data;
    },
    enabled: open && !!homework.id,
  });

  const gradeMutation = useMutation({
    mutationFn: async ({ submissionId, grade, feedback }: {
      submissionId: string;
      grade: number;
      feedback: string;
    }) => {
      const { error } = await supabase
        .from("homework_submissions")
        .update({
          grade,
          feedback: feedback || null,
          graded_by: user?.id,
          graded_at: new Date().toISOString(),
        })
        .eq("id", submissionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["homework-submissions-grading"] });
      toast.success("Note enregistrée");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const getSubmission = (studentId: string) => {
    return submissions?.find(s => s.student_id === studentId);
  };

  const handleGradeChange = (studentId: string, field: 'grade' | 'feedback', value: string) => {
    setGradingData(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: value,
      },
    }));
  };

  const handleSaveGrade = (studentId: string) => {
    const submission = getSubmission(studentId);
    const data = gradingData[studentId];

    if (!submission || !data?.grade) return;

    const grade = parseFloat(data.grade);
    if (isNaN(grade) || grade < 0 || grade > (homework.max_points || 20)) {
      toast.error(`La note doit être entre 0 et ${homework.max_points || 20}`);
      return;
    }

    gradeMutation.mutate({
      submissionId: submission.id,
      grade,
      feedback: data.feedback || "",
    });
  };

  const submittedCount = submissions?.length || 0;
  const totalStudents = students?.length || 0;
  const gradedCount = submissions?.filter(s => s.grade !== null).length || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {homework.title}
          </DialogTitle>
          <DialogDescription>
            Notez les devoirs rendus par les {studentsLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-4 mb-4">
          <Badge variant="outline" className="gap-1">
            <Users className="w-3 h-3" />
            {submittedCount}/{totalStudents} rendus
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <CheckCircle className="w-3 h-3" />
            {gradedCount} notés
          </Badge>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{StudentLabel}</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Travail rendu</TableHead>
                  <TableHead>Note /{homework.max_points || 20}</TableHead>
                  <TableHead>Commentaire</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students?.map((student: any) => {
                  const submission = getSubmission(student.id);
                  const currentGrade = gradingData[student.id]?.grade ?? (submission?.grade?.toString() || "");
                  const currentFeedback = gradingData[student.id]?.feedback ?? (submission?.feedback || "");
                  const isGraded = submission?.grade !== null && submission?.grade !== undefined;

                  return (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">
                        {student.first_name} {student.last_name}
                      </TableCell>
                      <TableCell>
                        {submission ? (
                          <Badge variant={isGraded ? "default" : "secondary"}>
                            {isGraded ? (
                              <>
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Noté
                              </>
                            ) : (
                              <>
                                <Clock className="w-3 h-3 mr-1" />
                                Rendu
                              </>
                            )}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Non rendu</Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        {submission?.content ? (
                          <p className="text-sm truncate" title={submission.content}>
                            {submission.content}
                          </p>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {submission ? (
                          <Input
                            type="number"
                            min="0"
                            max={homework.max_points || 20}
                            value={currentGrade}
                            onChange={(e) => handleGradeChange(student.id, 'grade', e.target.value)}
                            className="w-20"
                            placeholder="Note"
                          />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {submission ? (
                          <Input
                            value={currentFeedback}
                            onChange={(e) => handleGradeChange(student.id, 'feedback', e.target.value)}
                            className="min-w-[150px]"
                            placeholder="Commentaire..."
                          />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {submission && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSaveGrade(student.id)}
                            disabled={!gradingData[student.id]?.grade || gradeMutation.isPending}
                          >
                            <Save className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {!isLoading && students?.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              Aucun {studentLabel} inscrit dans cette classe
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HomeworkGradingDialog;
