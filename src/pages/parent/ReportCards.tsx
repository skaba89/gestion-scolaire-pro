import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, BarChart3, Users, AlertCircle, Loader2, Calendar } from "lucide-react";
import { isStudentMinor } from "@/lib/studentAge";
import { toast } from "sonner";
import { format } from "date-fns";
import { useParentData } from "@/features/parents/hooks/useParentData";
import { parentsService } from "@/features/parents/services/parentsService";
import { dateFnsLocale } from "@/lib/locale";

interface ParentTerm {
  id: string;
  name: string;
  academic_year?: { name: string } | null;
}
interface ParentChild {
  student_id: string;
  student?: { first_name?: string; last_name?: string; date_of_birth?: string | null };
}

const ReportCards = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { tenant } = useTenant();
  const [selectedChild, setSelectedChild] = useState("all");
  const [selectedTerm, setSelectedTerm] = useState("all");
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const { children: childrenData, studentIds, isLoading: childrenLoading, queries } = useParentData();
  const children: ParentChild[] = childrenData || [];

  const gradesQuery = useQuery({
    queryKey: ["parent-grades", tenant?.id, user?.id, studentIds, selectedChild, selectedTerm],
    queryFn: () => parentsService.getGrades(studentIds, selectedChild, selectedTerm === "all" ? undefined : selectedTerm),
    enabled: !!tenant?.id && !!user?.id && studentIds.length > 0,
  });
  const termsQuery = useQuery({
    queryKey: ["parent-terms", tenant?.id, user?.id],
    queryFn: async () => {
      const { data } = await apiClient.get<ParentTerm[]>("/parents/terms/");
      if (!Array.isArray(data)) throw new Error("Réponse de périodes invalide");
      return data;
    },
    enabled: !!tenant?.id && !!user?.id,
  });
  const grades = gradesQuery.data || [];
  const terms = termsQuery.data || [];
  const isLoading = childrenLoading || gradesQuery.isLoading || termsQuery.isLoading;
  const hasError = queries.dashboard.isError || gradesQuery.isError || termsQuery.isError;
  const selectedStudent = children.find(child => child.student_id === selectedChild)?.student;

  const handleDownloadReportCard = async () => {
    if (selectedChild === "all" || selectedTerm === "all") {
      toast.error(t("parentReportCards.selectChildAndPeriod"));
      return;
    }
    setGeneratingPdf(true);
    try {
      const pdf = await parentsService.generateReportCard(selectedChild, selectedTerm);
      const url = URL.createObjectURL(pdf);
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = "Bulletin.pdf";
        document.body.appendChild(link);
        try { link.click(); } finally { link.remove(); }
      } finally {
        URL.revokeObjectURL(url);
      }
      toast.success(t("parentReportCards.bulletinGenerated"));
    } catch {
      toast.error(t("parentReportCards.bulletinError"));
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{t("parentReportCards.pageTitle")}</h1>
        <p className="text-muted-foreground">{t("parentReportCards.pageSubtitle")}</p>
      </div>
      {selectedStudent && !isStudentMinor(selectedStudent.date_of_birth) && (
        <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{t("parentReportCards.minorOnly")}</AlertDescription></Alert>
      )}
      {(children.length > 0 || terms.length > 0) && (
        <Card><CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="w-full flex-1 flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground shrink-0" />
              <Select value={selectedChild} onValueChange={setSelectedChild}>
                <SelectTrigger className="w-full"><SelectValue placeholder={t("parentReportCards.selectChild")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("parentReportCards.allChildren")}</SelectItem>
                  {children.map(child => <SelectItem key={child.student_id} value={child.student_id}>{child.student?.first_name} {child.student?.last_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full flex-1 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
              <Select value={selectedTerm} onValueChange={setSelectedTerm}>
                <SelectTrigger className="w-full"><SelectValue placeholder={t("parentReportCards.period")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("parentReportCards.allPeriods")}</SelectItem>
                  {terms.map(term => <SelectItem key={term.id} value={term.id}>{term.name}{term.academic_year?.name ? ` (${term.academic_year.name})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleDownloadReportCard} disabled={generatingPdf || isLoading || hasError || selectedChild === "all" || selectedTerm === "all"} className="w-full sm:w-auto">
              {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
              {t("parentReportCards.generatePdf")}
            </Button>
          </div>
        </CardContent></Card>
      )}
      {hasError ? (
        <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{t("common.error")}</AlertDescription></Alert>
      ) : isLoading ? (
        <div className="space-y-4"><div className="h-32 bg-muted/20 animate-pulse rounded-xl" /><div className="h-64 bg-muted/20 animate-pulse rounded-xl" /></div>
      ) : grades.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" /><p className="text-muted-foreground">{t("parentReportCards.noGradesAvailable")}</p></CardContent></Card>
      ) : (
        <div className="space-y-6">
          <Card><CardContent className="p-4"><p className="text-2xl font-bold">{grades.length}</p><p className="text-xs text-muted-foreground">{t("parentReportCards.gradesDisplayed")}</p></CardContent></Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5" />{t("parentReportCards.gradesDisplayed")} - {terms.find(term => term.id === selectedTerm)?.name || t("parentReportCards.allPeriods")}</CardTitle></CardHeader>
            <CardContent><div className="space-y-4">
              {grades.map(grade => {
                const assessment = grade.assessments;
                const percentage = grade.score !== null && grade.max_score > 0 ? grade.score / grade.max_score * 100 : 0;
                return (
                  <div key={grade.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-bold">{assessment.name}</p>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mt-1">
                        <Badge variant="outline">{assessment.subjects.name}</Badge>
                        {assessment.terms && <Badge variant="secondary">{assessment.terms.name}</Badge>}
                        {selectedChild === "all" && <span>{grade.students.first_name} {grade.students.last_name}</span>}
                        {assessment.date && <span>{format(new Date(assessment.date), "dd MMM yyyy", { locale: dateFnsLocale() })}</span>}
                      </div>
                    </div>
                    <div className="text-right"><p className="font-bold">{grade.score ?? "—"} {t("parentReportCards.on")} {grade.max_score}</p><p className="text-xs text-muted-foreground">{grade.score === null ? "—" : `${percentage.toFixed(0)}%`}</p></div>
                  </div>
                );
              })}
            </div></CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
export default ReportCards;
