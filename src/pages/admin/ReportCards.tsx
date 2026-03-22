import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { FileText, ExternalLink, Printer, Users, GraduationCap, BarChart3 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PerformanceAnalytics } from "@/components/reports/PerformanceAnalytics";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { pedagogicalEngine, Grade as EngineGrade } from "@/utils/pedagogicalEngine";

interface Term {
  id: string;
  name: string;
  academic_year?: { name: string };
}

interface Classroom {
  id: string;
  name: string;
  level?: { name: string };
}

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  registration_number: string | null;
}

interface GradeData {
  student_id: string;
  subject_name: string;
  score: number | null;
  max_score: number;
  coefficient: number;
  weight: number;
}

const ReportCards = () => {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const { studentLabel, StudentLabel, studentsLabel, StudentsLabel, getLabel } = useStudentLabel();
  const [terms, setTerms] = useState<Term[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedTerm, setSelectedTerm] = useState("");
  const [selectedClassroom, setSelectedClassroom] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [studentGrades, setStudentGrades] = useState<Map<string, GradeData[]>>(new Map());

  const fetchData = async () => {
    if (!tenant) return;
    setLoading(true);

    const [termsRes, classroomsRes] = await Promise.all([
      supabase
        .from("terms")
        .select("id, name, academic_years(name)")
        .eq("tenant_id", tenant.id)
        .order("start_date", { ascending: false }),
      supabase
        .from("classrooms")
        .select("id, name, levels(name)")
        .eq("tenant_id", tenant.id)
        .order("name"),
    ]);

    if (!termsRes.error) {
      const formatted = (termsRes.data || []).map((t: any) => ({
        ...t,
        academic_year: t.academic_years,
      }));
      setTerms(formatted);
      if (formatted.length > 0) {
        setSelectedTerm(formatted[0].id);
      }
    }

    if (!classroomsRes.error) {
      const formatted = (classroomsRes.data || []).map((c: any) => ({
        ...c,
        level: c.levels,
      }));
      setClassrooms(formatted);
      if (formatted.length > 0) {
        setSelectedClassroom(formatted[0].id);
      }
    }

    setLoading(false);
  };

  const fetchStudentsAndGrades = async () => {
    if (!tenant || !selectedClassroom || !selectedTerm) return;

    // Get students enrolled in this classroom
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("student_id, students(id, first_name, last_name, registration_number)")
      .eq("class_id", selectedClassroom)
      .eq("status", "active");

    if (enrollments) {
      const studentList = enrollments
        .map((e: any) => e.students)
        .filter(Boolean);
      setStudents(studentList);

      // Get grades for these students
      const studentIds = studentList.map((s: Student) => s.id);

      const { data: grades } = await supabase
        .from("grades")
        .select(`
          student_id,
          score,
          assessments(
            name,
            max_score,
            weight,
            subject_id,
            subjects(name, coefficient)
          )
        `)
        .in("student_id", studentIds)
        .eq("tenant_id", tenant.id);

      // Group grades by student
      const gradesMap = new Map<string, GradeData[]>();

      if (grades) {
        grades.forEach((g: any) => {
          const studentGrades = gradesMap.get(g.student_id) || [];
          studentGrades.push({
            student_id: g.student_id,
            subject_name: g.assessments?.subjects?.name || "Unknown",
            score: g.score,
            max_score: g.assessments?.max_score || 20,
            coefficient: g.assessments?.subjects?.coefficient || 1,
            weight: g.assessments?.weight || 1,
          });
          gradesMap.set(g.student_id, studentGrades);
        });
      }

      setStudentGrades(gradesMap);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tenant]);

  useEffect(() => {
    fetchStudentsAndGrades();
  }, [selectedClassroom, selectedTerm]);

  const calculateAverage = (studentId: string): string => {
    const grades = studentGrades.get(studentId) || [];
    if (grades.length === 0) return "-";

    const engineGrades: EngineGrade[] = grades.map(g => ({
      score: g.score || 0,
      max_score: g.max_score,
      weight: g.weight,
      subject_id: "", // Not needed for simple average
      subject_name: g.subject_name,
      coefficient: g.coefficient
    }));

    // Group by subject to get subject-weighted general average
    const bySubject = new Map<string, EngineGrade[]>();
    engineGrades.forEach(g => {
      const list = bySubject.get(g.subject_name) || [];
      list.push(g);
      bySubject.set(g.subject_name, list);
    });

    let totalWeightedAverages = 0;
    let totalCoefficients = 0;

    bySubject.forEach((sGrades) => {
      const subjectAvg = pedagogicalEngine.calculateAverage(sGrades);
      const coeff = sGrades[0].coefficient;
      totalWeightedAverages += subjectAvg * coeff;
      totalCoefficients += coeff;
    });

    if (totalCoefficients === 0) return "-";
    return (totalWeightedAverages / totalCoefficients).toFixed(2);
  };

  const generatePDF = async (studentId: string, openInNewTab = true) => {
    setGenerating(true);

    try {
      const student = students.find(s => s.id === studentId);
      const term = terms.find(t => t.id === selectedTerm);
      const classroom = classrooms.find(c => c.id === selectedClassroom);
      const grades = studentGrades.get(studentId) || [];
      const average = calculateAverage(studentId);

      // Call edge function to generate report card HTML
      const { data, error } = await supabase.functions.invoke("generate-report-card", {
        body: {
          tenant: {
            name: tenant?.name,
            address: tenant?.address,
            phone: tenant?.phone,
            email: tenant?.email,
          },
          student: {
            firstName: student?.first_name,
            lastName: student?.last_name,
            registration_number: student?.registration_number,
          },
          classroom: classroom?.name,
          level: classroom?.level?.name,
          term: term?.name,
          academicYear: term?.academic_year?.name,
          grades: grades,
          average: average,
        },
      });

      if (error) throw error;

      // Decode base64 HTML and open in new tab with print dialog
      if (data?.html) {
        // Decode base64 to HTML
        const decodedHtml = atob(data.html);

        // Open in new window/tab
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.write(decodedHtml);
          printWindow.document.close();

          // Trigger print dialog after content loads
          printWindow.onload = () => {
            if (openInNewTab) {
              printWindow.print();
            }
          };

          // Fallback: trigger print after short delay
          setTimeout(() => {
            if (openInNewTab) {
              printWindow.print();
            }
          }, 500);

          toast({ title: "Succès", description: "Bulletin ouvert dans un nouvel onglet" });
        } else {
          toast({
            title: "Attention",
            description: "Veuillez autoriser les pop-ups pour afficher le bulletin",
            variant: "destructive"
          });
        }
      }
    } catch (error: any) {
      console.error("Error generating PDF:", error);
      toast({
        title: "Erreur",
        description: "Impossible de générer le bulletin. Veuillez réessayer.",
        variant: "destructive"
      });
    } finally {
      setGenerating(false);
    }
  };

  const generateAllPDFs = async () => {
    if (students.length === 0) return;
    setGenerating(true);
    toast({ title: "Info", description: "Préparation de la génération groupée..." });

    try {
      const term = terms.find(t => t.id === selectedTerm);
      const classroom = classrooms.find(c => c.id === selectedClassroom);

      const allReports = students.map(student => {
        const grades = studentGrades.get(student.id) || [];
        const average = calculateAverage(student.id);

        return {
          tenant: {
            name: tenant?.name,
            address: tenant?.address,
            phone: tenant?.phone,
            email: tenant?.email,
          },
          student: {
            firstName: student.first_name,
            lastName: student.last_name,
            registration_number: student.registration_number,
          },
          classroom: classroom?.name,
          level: classroom?.level?.name,
          term: term?.name,
          academicYear: term?.academic_year?.name,
          grades: grades,
          average: average,
        };
      });

      const { data, error } = await supabase.functions.invoke("generate-report-card", {
        body: { reports: allReports },
      });

      if (error) throw error;

      if (data?.html) {
        const decodedHtml = atob(data.html);
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.write(decodedHtml);
          printWindow.document.close();

          printWindow.onload = () => {
            printWindow.print();
          };

          setTimeout(() => {
            printWindow.print();
          }, 500);

          toast({ title: "Succès", description: "Document groupé généré avec succès" });
        } else {
          toast({
            title: "Attention",
            description: "Veuillez autoriser les pop-ups pour afficher les bulletins",
            variant: "destructive"
          });
        }
      }
    } catch (error: any) {
      console.error("Error generating bulk PDF:", error);
      toast({
        title: "Erreur",
        description: "Impossible de générer les bulletins groupés.",
        variant: "destructive"
      });
    } finally {
      setGenerating(false);
    }
  };

  if (!tenant) {
    return (
      <Card className="border-warning/50 bg-warning/5">
        <CardContent className="p-6">
          <p className="text-muted-foreground">
            Veuillez d'abord configurer votre établissement.
          </p>
        </CardContent>
      </Card>
    );
  }

  const selectedTermName = terms.find(t => t.id === selectedTerm)?.name || "Trimestre";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Bulletins & Performance</h1>
          <p className="text-muted-foreground">Analysez les résultats et générez les bulletins</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Trimestre</Label>
              <Select value={selectedTerm} onValueChange={setSelectedTerm}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un trimestre" />
                </SelectTrigger>
                <SelectContent>
                  {terms.map((term) => (
                    <SelectItem key={term.id} value={term.id}>
                      {term.name} ({term.academic_year?.name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Classe</Label>
              <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une classe" />
                </SelectTrigger>
                <SelectContent>
                  {classrooms.map((classroom) => (
                    <SelectItem key={classroom.id} value={classroom.id}>
                      {classroom.name} {classroom.level ? `(${classroom.level.name})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={generateAllPDFs}
                disabled={students.length === 0 || generating}
                className="w-full"
              >
                <Printer className="w-4 h-4 mr-2" />
                Générer tous les bulletins
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">
            <BarChart3 className="w-4 h-4 mr-2" />
            Vue d'ensemble
          </TabsTrigger>
          <TabsTrigger value="reports">
            <FileText className="w-4 h-4 mr-2" />
            Bulletins individuels
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {loading ? (
            <div className="text-center py-12">Chargement des données...</div>
          ) : (
            <PerformanceAnalytics
              students={students}
              studentGrades={studentGrades}
              termName={selectedTermName}
            />
          )}
        </TabsContent>

        <TabsContent value="reports">
          {/* Students List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                {StudentsLabel} de la classe
              </CardTitle>
              <CardDescription>
                {students.length} {students.length > 1 ? studentsLabel : studentLabel} inscrit(s)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Chargement...</div>
              ) : students.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <GraduationCap className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Aucun {studentLabel} inscrit dans cette classe</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N° Étudiant</TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead>Prénom</TableHead>
                      <TableHead>Moyenne</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map((student) => (
                      <TableRow key={student.id}>
                        <TableCell className="font-mono text-sm">
                          {student.registration_number || "-"}
                        </TableCell>
                        <TableCell className="font-medium">{student.last_name}</TableCell>
                        <TableCell>{student.first_name}</TableCell>
                        <TableCell>
                          <span className="font-semibold">{calculateAverage(student.id)}</span>
                          <span className="text-muted-foreground">/20</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => generatePDF(student.id)}
                            disabled={generating}
                          >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Ouvrir & Imprimer
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ReportCards;
