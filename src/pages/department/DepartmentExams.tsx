import { useState } from "react";
import { useDepartmentExams, ExamFormData } from "@/features/departments/hooks/useDepartment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2, Calendar, Clock } from "lucide-react";
import { format } from "date-fns";
import type { DeptExam } from "@/features/departments/hooks/useDepartment";
import { dateFnsLocale } from "@/lib/locale";
import { useTranslation } from "react-i18next";

const defaultForm: ExamFormData = {
  name: "", description: "", exam_date: "",
  start_time: "", end_time: "", room_name: "",
  max_score: 20, status: "scheduled",
  class_id: "", subject_id: "", term_id: "",
};

const DepartmentExams = () => {
  const { t } = useTranslation();
  const { data, isLoading, createExam, updateExam, deleteExam } = useDepartmentExams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<DeptExam | null>(null);
  const [formData, setFormData] = useState<ExamFormData>(defaultForm);

  const exams = data?.exams || [];
  const classrooms = data?.classrooms || [];
  const subjects = data?.subjects || [];
  const terms = data?.terms || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingExam) {
      await updateExam.mutateAsync({ id: editingExam.id, ...formData });
    } else {
      await createExam.mutateAsync(formData);
    }
    setDialogOpen(false);
    setFormData(defaultForm);
    setEditingExam(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cet examen ?")) return;
    await deleteExam.mutateAsync(id);
  };

  const openEdit = (exam: DeptExam) => {
    setEditingExam(exam);
    setFormData({
      name: exam.name, description: exam.description || "",
      exam_date: exam.exam_date,
      start_time: exam.start_time || "", end_time: exam.end_time || "",
      room_name: exam.room_name || "", max_score: exam.max_score,
      status: exam.status, class_id: exam.class_id || "",
      subject_id: exam.subject_id || "", term_id: exam.term_id || "",
    });
    setDialogOpen(true);
  };

  const getStatusBadge = (status: string | null) => {
    const variants: Record<string, { label: string; className: string }> = {
      scheduled: { label: t("departmentPortal.exams.status.scheduled"), className: "bg-blue-100 text-blue-800" },
      in_progress: { label: t("departmentPortal.exams.status.in_progress"), className: "bg-yellow-100 text-yellow-800" },
      completed: { label: t("departmentPortal.exams.status.completed"), className: "bg-green-100 text-green-800" },
      cancelled: { label: t("departmentPortal.exams.status.cancelled"), className: "bg-red-100 text-red-800" },
    };
    const v = variants[status || "scheduled"];
    return <Badge className={v.className}>{v.label}</Badge>;
  };

  if (isLoading) return <div className="p-6">{t("departmentPortal.loading")}</div>;

  if (!data?.department) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">{t("departmentPortal.exams.notAssigned")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("departmentPortal.exams.title")}</h1>
          <p className="text-muted-foreground">
            {t("departmentPortal.exams.subtitle")}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingExam(null); setFormData(defaultForm); }}>
              <Plus className="mr-2 h-4 w-4" />
              {t("departmentPortal.exams.new")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingExam ? t("departmentPortal.exams.edit") : t("departmentPortal.exams.new")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>{t("departmentPortal.exams.name")}</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                </div>

                <div>
                  <Label>{t("departmentPortal.exams.term")}</Label>
                  <Select value={formData.term_id} onValueChange={(v) => setFormData({ ...formData, term_id: v })} required>
                    <SelectTrigger><SelectValue placeholder={t("departmentPortal.exams.select")} /></SelectTrigger>
                    <SelectContent>
                      {terms.filter(t => t.id).map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>{t("departmentPortal.exams.subject")}</Label>
                  <Select value={formData.subject_id} onValueChange={(v) => setFormData({ ...formData, subject_id: v })} required>
                    <SelectTrigger><SelectValue placeholder={t("departmentPortal.exams.select")} /></SelectTrigger>
                    <SelectContent>
                      {subjects.filter(s => s.id).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>{t("departmentPortal.exams.class")}</Label>
                  <Select value={formData.class_id} onValueChange={(v) => setFormData({ ...formData, class_id: v })}>
                    <SelectTrigger><SelectValue placeholder={t("departmentPortal.allClasses")} /></SelectTrigger>
                    <SelectContent>
                      {classrooms.filter(c => c.id).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>{t("departmentPortal.exams.date")}</Label>
                  <Input type="date" value={formData.exam_date} onChange={(e) => setFormData({ ...formData, exam_date: e.target.value })} required />
                </div>
                <div>
                  <Label>{t("departmentPortal.exams.startTime")}</Label>
                  <Input type="time" value={formData.start_time} onChange={(e) => setFormData({ ...formData, start_time: e.target.value })} />
                </div>
                <div>
                  <Label>{t("departmentPortal.exams.endTime")}</Label>
                  <Input type="time" value={formData.end_time} onChange={(e) => setFormData({ ...formData, end_time: e.target.value })} />
                </div>
                <div>
                  <Label>{t("departmentPortal.exams.room")}</Label>
                  <Input value={formData.room_name} onChange={(e) => setFormData({ ...formData, room_name: e.target.value })} placeholder={t("departmentPortal.exams.roomPlaceholder")} />
                </div>
                <div>
                  <Label>{t("departmentPortal.exams.maxScore")}</Label>
                  <Input type="number" value={formData.max_score} onChange={(e) => setFormData({ ...formData, max_score: parseFloat(e.target.value) || 20 })} />
                </div>
                <div>
                  <Label>{t("departmentPortal.exams.statusLabel")}</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled">{t("departmentPortal.exams.status.scheduled")}</SelectItem>
                      <SelectItem value="in_progress">{t("departmentPortal.exams.status.in_progress")}</SelectItem>
                      <SelectItem value="completed">{t("departmentPortal.exams.status.completed")}</SelectItem>
                      <SelectItem value="cancelled">{t("departmentPortal.exams.status.cancelled")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>{t("departmentPortal.exams.description")}</Label>
                  <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{t("departmentPortal.exams.cancel")}</Button>
                <Button type="submit" disabled={createExam.isPending || updateExam.isPending}>
                  {editingExam ? t("departmentPortal.exams.save") : t("departmentPortal.exams.create")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t("departmentPortal.exams.planned")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {exams.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{t("departmentPortal.exams.none")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("departmentPortal.exams.col.exam")}</TableHead>
                  <TableHead>{t("departmentPortal.exams.col.subject")}</TableHead>
                  <TableHead>{t("departmentPortal.exams.col.class")}</TableHead>
                  <TableHead>{t("departmentPortal.exams.col.date")}</TableHead>
                  <TableHead>{t("departmentPortal.exams.col.times")}</TableHead>
                  <TableHead>{t("departmentPortal.exams.col.room")}</TableHead>
                  <TableHead>{t("departmentPortal.exams.col.status")}</TableHead>
                  <TableHead className="w-[100px]">{t("departmentPortal.exams.col.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exams.map((exam) => (
                  <TableRow key={exam.id}>
                    <TableCell className="font-medium">{exam.name}</TableCell>
                    <TableCell>{exam.subject?.name}</TableCell>
                    <TableCell>{exam.classroom?.name || t("departmentPortal.exams.allClasses")}</TableCell>
                    <TableCell>
                      {format(new Date(exam.exam_date), "dd MMM yyyy", { locale: dateFnsLocale() })}
                    </TableCell>
                    <TableCell>
                      {exam.start_time && exam.end_time ? (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {exam.start_time.slice(0, 5)} - {exam.end_time.slice(0, 5)}
                        </span>
                      ) : "-"}
                    </TableCell>
                    <TableCell>{exam.room_name || "-"}</TableCell>
                    <TableCell>{getStatusBadge(exam.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(exam)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(exam.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DepartmentExams;
