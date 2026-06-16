import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  BarChart3,
  Search,
  Plus,
  FileText,
  BookOpen,
  Users,
  Calendar
} from "lucide-react";
import { toast } from "sonner";
import { generateReportCard } from "@/utils/pdfGenerator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const Grades = () => {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClassroom, setSelectedClassroom] = useState<string>("all");

  const { data: classrooms } = useQuery({
    queryKey: ["classrooms", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data } = await apiClient.get("/infrastructure/classrooms/");
      return data;
    },
    enabled: !!tenant?.id,
  });

  const { data: assessments, isLoading } = useQuery({
    queryKey: ["assessments", tenant?.id, selectedClassroom],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data } = await apiClient.get("/assessments/", {
        params: selectedClassroom !== "all" ? { classId: selectedClassroom } : {}
      });
      return data.items || data;
    },
    enabled: !!tenant?.id,
  });

  const { data: subjects } = useQuery({
    queryKey: ["subjects", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data } = await apiClient.get("/subjects/");
      return data;
    },
    enabled: !!tenant?.id,
  });

  const { data: currentTerms } = useQuery({
    queryKey: ["terms", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data } = await apiClient.get("/terms/");
      return data;
    },
    enabled: !!tenant?.id,
  });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newAssessment, setNewAssessment] = useState({
    name: "",
    type: "EXAM",
    date: new Date().toISOString().split('T')[0],
    max_score: 20,
    weight: 1,
    class_id: "",
    subject_id: "",
    term_id: ""
  });

  const queryClient = useQueryClient();
  const createMutation = useMutation({
    mutationFn: async (assessment: any) => {
      const { data } = await apiClient.post("/assessments/", assessment);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessments"] });
      toast.success(t("grades.assessmentCreated"));
      setIsCreateOpen(false);
    },
    onError: (error: any) => {
      console.error('[SchoolFlow] Error creating assessment:', error);
      toast.error(error?.response?.data?.detail || t("grades.assessmentCreateError"));
    }
  });

  // Mémoïsation du filtrage et des calculs de notes
  const filteredAssessments = useMemo(() =>
    (assessments || []).filter((assessment) =>
      assessment.name.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [],
    [assessments, searchTerm]);

  // Mémoïsation des statistiques
  const stats = useMemo(() => {
    const total = (assessments || []).length || 0;
    const classroomCount = classrooms?.length || 0;

    return {
      total,
      subjects: subjects?.length || 0,
      classrooms: classroomCount,
    };
  }, [assessments, subjects, classrooms]);

  // useCallback pour les handlers
  const handleSearch = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  const handleClassroomChange = useCallback((value: string) => {
    setSelectedClassroom(value);
  }, []);

  const handleGenerateBulletins = () => {
    try {
      if (!assessments || assessments.length === 0) {
        toast.info(t("grades.noDataForBulletin"));
        return;
      }

      const firstAssessment = assessments[0] as any;
      const classroom = firstAssessment.classrooms?.name || (classrooms?.[0] as any)?.name || "Classe";
      const subject = firstAssessment.subjects?.name || (subjects?.[0] as any)?.name || "Matière";
      const term = (currentTerms?.[0] as any)?.name || "Période en cours";

      const sampleStudent = { first_name: "Élève", last_name: "Type" };
      const sampleClass = { name: classroom };
      const sampleTerm = { name: term };

      const grades = assessments.slice(0, 10).map((a: any) => ({
        ...a,
        score: a.max_score ? Math.round(a.max_score * 0.75) : 15,
        description: `${subject} - ${a.name}`
      }));

      generateReportCard(sampleStudent, sampleClass, sampleTerm, grades, tenant);
      toast.success(t("grades.bulletinGenerated", { count: grades.length }));
    } catch (e) {
      toast.error(t("grades.bulletinError"));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">{t("grades.pageTitle")}</h1>
          <p className="text-muted-foreground">{t("grades.pageSubtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleGenerateBulletins}>
            <FileText className="w-4 h-4 mr-2" />
            {t("grades.generateBulletins")}
          </Button>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {t("grades.newAssessment")}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">{t("grades.assessments")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-secondary/50 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.subjects}</p>
                <p className="text-xs text-muted-foreground">{t("grades.subjects")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/50 flex items-center justify-center">
                <Users className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{classrooms?.length || 0}</p>
                <p className="text-xs text-muted-foreground">{t("grades.classes")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                <Calendar className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{currentTerms?.length || 0}</p>
                <p className="text-xs text-muted-foreground">{t("grades.periods")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("grades.searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={t("grades.allClasses")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("grades.allClasses")}</SelectItem>
                {classrooms?.map((classroom) => (
                  <SelectItem key={classroom.id} value={classroom.id}>
                    {classroom.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Assessments Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            {t("grades.assessments")} ({filteredAssessments?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              {t("common.loading")}
            </div>
          ) : filteredAssessments?.length === 0 ? (
            <div className="text-center py-12">
              <BarChart3 className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground">{t("grades.noAssessmentFound")}</p>
              <p className="text-sm text-muted-foreground/70">
                {t("grades.noAssessmentSub")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("grades.colAssessment")}</TableHead>
                    <TableHead>{t("grades.subject")}</TableHead>
                    <TableHead>{t("grades.classes")}</TableHead>
                    <TableHead>{t("grades.type")}</TableHead>
                    <TableHead>{t("grades.colMaxScore")}</TableHead>
                    <TableHead>{t("grades.coefficient")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssessments?.map((assessment) => (
                    <TableRow key={assessment.id}>
                      <TableCell className="font-medium">{assessment.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {(assessment.subjects as any)?.name || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell>{(assessment.classrooms as any)?.name || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{assessment.type}</Badge>
                      </TableCell>
                      <TableCell>{assessment.max_score}</TableCell>
                      <TableCell>{assessment.weight}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Empty state for getting started */}
      {!isLoading && (assessments?.length === 0 || subjects?.length === 0 || classrooms?.length === 0) && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <h3 className="text-lg font-semibold mb-2">{t("grades.configRequired")}</h3>
            <p className="text-muted-foreground mb-4">
              {t("grades.configRequiredText")}
            </p>
            <ul className="text-sm text-muted-foreground space-y-1">
              {subjects?.length === 0 && <li>• {t("grades.configSubjects")}</li>}
              {classrooms?.length === 0 && <li>• {t("grades.configClasses")}</li>}
              <li>• {t("grades.configTerms")}</li>
            </ul>
          </CardContent>
        </Card>
      )}
      {/* Create Assessment Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("grades.newAssessment")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("grades.assessmentName")}</Label>
              <Input
                placeholder={t("grades.assessmentNamePlaceholder")}
                value={newAssessment.name}
                onChange={(e) => setNewAssessment({ ...newAssessment, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("grades.classes")}</Label>
                <Select
                  value={newAssessment.class_id}
                  onValueChange={(v) => setNewAssessment({ ...newAssessment, class_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("grades.choose")} />
                  </SelectTrigger>
                  <SelectContent>
                    {classrooms?.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("grades.subject")}</Label>
                <Select
                  value={newAssessment.subject_id}
                  onValueChange={(v) => setNewAssessment({ ...newAssessment, subject_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("grades.choose")} />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects?.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("grades.termSemester")}</Label>
                <Select
                  value={newAssessment.term_id}
                  onValueChange={(v) => setNewAssessment({ ...newAssessment, term_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("grades.choose")} />
                  </SelectTrigger>
                  <SelectContent>
                    {currentTerms?.map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("grades.date")}</Label>
                <Input
                  type="date"
                  value={newAssessment.date}
                  onChange={(e) => setNewAssessment({ ...newAssessment, date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("grades.colMaxScore")}</Label>
                <Input
                  type="number"
                  value={newAssessment.max_score}
                  onChange={(e) => setNewAssessment({ ...newAssessment, max_score: parseFloat(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("grades.coefficient")}</Label>
                <Input
                  type="number"
                  value={newAssessment.weight}
                  onChange={(e) => setNewAssessment({ ...newAssessment, weight: parseFloat(e.target.value) })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button
              onClick={() => createMutation.mutate(newAssessment)}
              disabled={createMutation.isPending || !newAssessment.name || !newAssessment.class_id || !newAssessment.subject_id}
            >
              {createMutation.isPending ? t("grades.creating") : t("grades.createAssessment")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Grades;
