import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Homework, HomeworkWithSubmissions } from "@/features/homework/types/homework";
import { useStudentLabel } from "@/hooks/useStudentLabel";

interface Student {
  id: string;
  first_name: string;
  last_name: string;
}

interface Props {
  homework: Pick<Homework, "id" | "title" | "class_id"> & { max_points?: number | null };
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Draft {
  grade?: string;
  feedback?: string;
}

export default function HomeworkGradingDialog({ homework, tenantId, open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { StudentLabel } = useStudentLabel();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const maxGrade = Math.min(homework.max_points ?? 20, 20);
  const queryKey = ["homework-grading", tenantId, user?.id, homework.class_id, homework.id];
  const roster = useQuery({
    queryKey,
    enabled: open && !!user?.id && !!tenantId && !!homework.class_id,
    gcTime: 0,
    staleTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const { data: enrollments } = await apiClient.get<{ student: Student | null }[]>("/infrastructure/enrollments/", {
        params: { class_id: homework.class_id, status: "active" }, signal,
      });
      const students = new Map<string, Student>();
      for (const { student } of enrollments) {
        if (student) students.set(student.id, student);
      }
      if (!students.size) return [];

      const { data: detail } = await apiClient.get<HomeworkWithSubmissions>(`/homework/${homework.id}/`, { signal });
      if (detail.tenant_id !== tenantId || detail.class_id !== homework.class_id || detail.id !== homework.id) {
        throw new Error("Homework scope changed");
      }
      const submissions = new Map((detail.submissions ?? [])
        .filter(s => s.homework_id === homework.id && s.tenant_id === tenantId && students.has(s.student_id))
        .map(s => [s.student_id, s]));
      return Array.from(students.values(), student => ({ student, submission: submissions.get(student.id) }));
    },
  });
  const save = useMutation({
    mutationFn: async ({ id, grade, feedback }: { id: string; grade: number; feedback: string }) => {
      await apiClient.put(`/homework-submissions/${id}`, { grade, feedback: feedback || null });
    },
    onSuccess: async (_, { id }) => {
      await queryClient.invalidateQueries({ queryKey, exact: true });
      setDrafts(previous => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
      toast.success(t("homework.gradeSaved"));
    },
    onError: () => toast.error(t("homework.gradeSaveError")),
  });

  function edit(id: string, changes: Draft) {
    setDrafts(previous => ({ ...previous, [id]: { ...previous[id], ...changes } }));
  }
  const rows = roster.data ?? [];
  const submitted = rows.filter(row => row.submission).length;
  const graded = rows.filter(row => row.submission?.grade != null).length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{homework.title}</DialogTitle>
          <DialogDescription>{t("homework.gradeSubmissions")}</DialogDescription>
        </DialogHeader>
        {roster.isFetching || roster.isPending ? <p role="status">{t("common.loading")}</p> :
          roster.isError ? <p role="alert">{t("homework.gradingLoadError")}</p> :
          !rows.length ? <p>{t("homework.gradingEmpty")}</p> : (
          <>
            <p>{t("homework.submissions")} {submitted}/{rows.length} · {t("homework.graded")} {graded} · {t("homework.pending")} {submitted - graded}</p>
            <Table>
              <TableHeader><TableRow>
                <TableHead>{StudentLabel}</TableHead><TableHead>{t("common.status")}</TableHead>
                <TableHead>{t("homework.submissions")}</TableHead><TableHead>{t("grades.grade")} /{maxGrade}</TableHead>
                <TableHead>{t("homework.gradingFeedback")}</TableHead><TableHead>{t("common.save")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>{rows.map(({ student, submission }) => {
                const name = `${student.first_name} ${student.last_name}`;
                const draft = submission && drafts[submission.id];
                const grade = draft?.grade ?? String(submission?.grade ?? "");
                const feedback = draft?.feedback ?? submission?.feedback ?? "";
                const validGrade = /^\d+(\.\d{1,2})?$/.test(grade) && Number(grade) <= maxGrade;
                return (
                  <TableRow key={student.id}>
                    <TableCell>{name}</TableCell>
                    <TableCell>{t(submission ? (submission.grade != null ? "homework.graded" : "homework.submitted") : "parentPortal.homeworkTab.notSubmitted")}</TableCell>
                    <TableCell className="max-w-xs break-words">{submission?.content ?? "—"}</TableCell>
                    {submission ? <>
                      <TableCell><Input type="number" className="w-24" min={0} max={maxGrade} step="0.01"
                        aria-label={`${t("grades.grade")} · ${name}`} value={grade} disabled={save.isPending}
                        onChange={e => edit(submission.id, { grade: e.target.value })} /></TableCell>
                      <TableCell><Input aria-label={`${t("homework.gradingFeedback")} · ${name}`} value={feedback}
                        disabled={save.isPending} onChange={e => edit(submission.id, { feedback: e.target.value })} /></TableCell>
                      <TableCell><Button size="sm" disabled={!draft || !validGrade || save.isPending}
                        onClick={() => save.mutate({ id: submission.id, grade: Number(grade), feedback })}>
                        {t("common.save")}
                      </Button></TableCell>
                    </> : <TableCell colSpan={3}>—</TableCell>}
                  </TableRow>
                );
              })}</TableBody>
            </Table>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
