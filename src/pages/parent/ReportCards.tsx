import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { parentQueries } from "@/queries/parents";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  Download,
  BarChart3,
  Users,
  AlertCircle,
  Loader2,
  Calendar
} from "lucide-react";
import { isStudentMinor } from "@/lib/studentAge";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

import { useParentData } from "@/features/parents/hooks/useParentData";
import { parentsService } from "@/features/parents/services/parentsService";

const ReportCards = () => {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const [selectedChild, setSelectedChild] = useState<string>("all");
  const [selectedTerm, setSelectedTerm] = useState<string>("all");
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // 1. Fetch Children from consolidated hook
  const { children: childrenData, studentIds, isLoading: childrenLoading } = useParentData();

  const children = childrenData?.map(c => ({
    student_id: c.student_id,
    students: c.student
  })) || [];

  // 2. Fetch Grades via parentsService
  const { data: grades, isLoading: gradesLoading } = useQuery({
    queryKey: ["parent-grades", studentIds, selectedChild],
    queryFn: () => parentsService.getGrades(studentIds, selectedChild),
    enabled: studentIds.length > 0,
  });

  // 3. Fetch Terms
  const { data: terms } = useQuery({
    queryKey: ["terms", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("terms")
        .select("*")
        .eq("tenant_id", tenant?.id)
        .order("start_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  // 4. Fetch Enrollment for selected child (to get classroom info)
  const { data: enrollment } = useQuery({
    queryKey: ["enrollment", selectedChild],
    queryFn: async () => {
      if (selectedChild === "all") return null;
      const { data, error } = await supabase
        .from("enrollments")
        .select(`
          *,
          classrooms (name),
          levels (name),
          academic_years (name)
        `)
        .eq("student_id", selectedChild)
        .eq("status", "active")
        .single();
      if (error) return null; // Might not have active enrollment
      return data;
    },
    enabled: selectedChild !== "all",
  });

  const isLoading = childrenLoading || gradesLoading;

  // Filter grades by term if selected
  const filteredGrades = grades?.filter(grade => {
    if (selectedTerm === "all") return true;
    const term = terms?.find(t => t.id === selectedTerm);
    if (!term || !grade.assessments?.date) return true;
    const gradeDate = new Date(grade.assessments.date);
    return gradeDate >= new Date(term.start_date) && gradeDate <= new Date(term.end_date);
  });

  const handleDownloadReportCard = async () => {
    if (selectedChild === "all" || selectedTerm === "all") {
      toast.error("Veuillez sélectionner un enfant et une période (trimestre)");
      return;
    }

    if (!enrollment) {
      toast.error("Aucune inscription active trouvée pour cet élève");
      return;
    }

    setGeneratingPdf(true);
    try {
      const student = children.find(c => c.student_id === selectedChild)?.students;
      const term = terms?.find(t => t.id === selectedTerm);

      // Calculate average
      const gradesForReport = filteredGrades || [];
      const totalScore = gradesForReport.reduce((sum, g) => sum + (g.score || 0), 0);
      const totalMax = gradesForReport.reduce((sum, g) => sum + (g.assessments?.max_score || 20), 0);
      const average = totalMax > 0 ? ((totalScore / totalMax) * 20).toFixed(2) : "N/A";

      const reportData = {
        tenant: {
          name: tenant?.name || "École",
          address: tenant?.address,
          phone: tenant?.phone,
          email: tenant?.email,
        },
        student: {
          firstName: student?.first_name || "",
          lastName: student?.last_name || "",
          matricule: student?.registration_number,
        },
        classroom: (enrollment.classrooms as any)?.name || "Non assigné",
        level: (enrollment.levels as any)?.name,
        term: term?.name || "Période personnalisée",
        academicYear: (enrollment.academic_years as any)?.name,
        grades: gradesForReport.map(g => ({
          subject_name: g.assessments?.subjects?.name || g.assessments?.name || "Matière inconnue",
          score: g.score,
          max_score: g.assessments?.max_score || 20,
          coefficient: (g.assessments?.subjects as any)?.coefficient || 1, // Assumption: subject has coefficient, fallback to 1
        })),
        average: average,
      };

      const { data, error } = await supabase.functions.invoke("generate-report-card", {
        body: reportData,
      });

      if (error) throw error;

      if (data?.html) {
        // Create a hidden iframe or new window to print
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.write(data.html);
          printWindow.document.close();
          printWindow.focus();
          // Small delay to ensure styles are loaded/rendered
          setTimeout(() => {
            printWindow.print();
          }, 500);
        } else {
          toast.error("Impossible d'ouvrir la fenêtre d'impression. Veuillez autoriser les pop-ups.");
        }
      } else {
        throw new Error("Format de réponse invalide");
      }

      toast.success("Bulletin généré avec succès");

    } catch (error: any) {
      console.error("Error generating report card:", error);
      toast.error(error.message || "Erreur lors de la génération du bulletin");
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Bulletins Scolaires</h1>
          <p className="text-muted-foreground">Consultez et téléchargez les bulletins de notes</p>
        </div>
      </div>

      {/* Age Restriction Alert */}
      {selectedChild && selectedChild !== "all" && children?.length > 0 && (
        (() => {
          const selectedStudent = children?.find(c => c.student_id === selectedChild);
          const isMinor = isStudentMinor((selectedStudent?.students as any)?.date_of_birth);

          if (!isMinor) {
            return (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Vous ne pouvez consulter les bulletins que pour les enfants mineurs.
                </AlertDescription>
              </Alert>
            );
          }
          return null;
        })()
      )}

      {/* Filters */}
      {(children?.length > 0 || terms?.length) && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="w-full sm:w-auto flex-1 flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                <Select value={selectedChild} onValueChange={setSelectedChild}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sélectionner un enfant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les enfants</SelectItem>
                    {children?.map((relation) => {
                      const student = relation.students as any;
                      return (
                        <SelectItem key={relation.student_id} value={relation.student_id}>
                          {student?.first_name} {student?.last_name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full sm:w-auto flex-1 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                <Select value={selectedTerm} onValueChange={setSelectedTerm}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Période (Trimestre)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les périodes</SelectItem>
                    {terms?.map((term) => (
                      <SelectItem key={term.id} value={term.id}>
                        {term.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleDownloadReportCard}
                disabled={generatingPdf || selectedChild === "all" || selectedTerm === "all"}
                className="w-full sm:w-auto"
              >
                {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                Générer PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Report Cards Content */}
      {isLoading ? (
        <div className="space-y-4">
          <div className="h-32 bg-muted/20 animate-pulse rounded-xl" />
          <div className="h-64 bg-muted/20 animate-pulse rounded-xl" />
        </div>
      ) : grades?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground">Aucune note disponible pour les critères sélectionnés</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{filteredGrades?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">Notes affichées</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Grades List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Notes - {terms?.find(t => t.id === selectedTerm)?.name || "Toutes périodes"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredGrades?.map((grade) => {
                  const assessment = grade.assessments as any;
                  const student = grade.students as any;
                  const subject = assessment?.subjects as any;
                  const percentage = grade.score && assessment?.max_score
                    ? (grade.score / assessment.max_score) * 100
                    : 0;

                  const gradeDate = assessment?.date ? new Date(assessment.date) : null;
                  const termName = terms?.find(t =>
                    gradeDate && new Date(t.start_date) <= gradeDate && new Date(t.end_date) >= gradeDate
                  )?.name;

                  return (
                    <div
                      key={grade.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-muted/50 transition-all hover:bg-muted/80"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${percentage >= 70 ? 'bg-green-500/10 text-green-600' :
                          percentage >= 50 ? 'bg-orange-500/10 text-orange-600' :
                            'bg-red-500/10 text-red-600'
                          }`}>
                          <span className="font-bold text-lg">{grade.score}</span>
                        </div>
                        <div>
                          <p className="font-bold">{assessment?.name}</p>
                          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mt-1">
                            <Badge variant="outline" className="bg-background">{subject?.name}</Badge>
                            {termName && (
                              <Badge variant="secondary" className="text-[10px]">{termName}</Badge>
                            )}
                            {selectedChild === "all" && (
                              <>
                                <span>•</span>
                                <span>{student?.first_name} {student?.last_name}</span>
                              </>
                            )}
                            {assessment?.date && (
                              <>
                                <span>•</span>
                                <span>{format(new Date(assessment.date), "dd MMM yyyy", { locale: fr })}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm">
                          Sur {assessment?.max_score}
                        </p>
                        <p className={`text-xs font-medium ${percentage >= 50 ? 'text-green-600' : 'text-red-600'
                          }`}>
                          {percentage.toFixed(0)}%
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ReportCards;
