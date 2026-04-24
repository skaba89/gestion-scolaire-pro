import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { apiClient } from "@/api/client";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  FileText, Printer, Users, GraduationCap, BarChart3,
  Download, ChevronDown, Info, Award
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PerformanceAnalytics } from "@/components/reports/PerformanceAnalytics";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { pedagogicalEngine, Grade as EngineGrade } from "@/utils/pedagogicalEngine";

// ── Types ──────────────────────────────────────────────────────────────────────

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

// ── Décision choices ────────────────────────────────────────────────────────────

const DECISIONS = [
  { value: "", label: "— À déterminer —" },
  { value: "Passage", label: "✅ Passage en classe supérieure" },
  { value: "Félicitations", label: "🏆 Félicitations du conseil" },
  { value: "Encouragements", label: "👏 Encouragements" },
  { value: "Avertissement", label: "⚠️ Avertissement de travail" },
  { value: "Redoublement", label: "🔁 Redoublement" },
];

// ── Helper: open bulletin in new tab or download ────────────────────────────────

function openOrDownload(base64Html: string, filename: string, toast: any) {
  const decodedHtml = atob(base64Html);
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(decodedHtml);
    printWindow.document.close();
    setTimeout(() => { try { printWindow.print(); } catch {} }, 700);
  } else {
    // Popup blocked → download as HTML file
    const blob = new Blob([decodedHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "Bulletin téléchargé",
      description: "Ouvrez le fichier .html dans votre navigateur et cliquez Imprimer → Enregistrer en PDF",
    });
  }
}

// ── Main Component ─────────────────────────────────────────────────────────────

const ReportCards = () => {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const { studentLabel, StudentsLabel, studentsLabel } = useStudentLabel();

  const [terms, setTerms] = useState<Term[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedTerm, setSelectedTerm] = useState("");
  const [selectedClassroom, setSelectedClassroom] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null); // studentId or "batch"

  // Council decision (applied to all bulletins in this batch)
  const [decision, setDecision] = useState("");
  const [directorComment, setDirectorComment] = useState("");
  const [showGuineaHeader, setShowGuineaHeader] = useState(true);
  const [showCouncilOptions, setShowCouncilOptions] = useState(false);

  // Legacy grade data (for PerformanceAnalytics tab)
  const [studentGrades, setStudentGrades] = useState<Map<string, GradeData[]>>(new Map());

  // ── Data loading ────────────────────────────────────────────────────────────

  const fetchData = async () => {
    if (!tenant) return;
    setLoading(true);
    try {
      const [termsRes, classroomsRes] = await Promise.all([
        apiClient.get<any[]>("/terms/").catch(() => ({ data: [] })),
        apiClient.get<any[]>("/infrastructure/classrooms/").catch(() => ({ data: [] })),
      ]);
      const formattedTerms = (termsRes.data || []).map((t: any) => ({
        ...t,
        academic_year: t.academic_year || t.academic_years,
      }));
      setTerms(formattedTerms);
      if (formattedTerms.length > 0) setSelectedTerm(formattedTerms[0].id);

      const formattedClassrooms = (classroomsRes.data || []).map((c: any) => ({
        ...c,
        level: c.level || c.levels,
      }));
      setClassrooms(formattedClassrooms);
      if (formattedClassrooms.length > 0) setSelectedClassroom(formattedClassrooms[0].id);
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les données", variant: "destructive" });
    }
    setLoading(false);
  };

  const fetchStudentsAndGrades = async () => {
    if (!tenant || !selectedClassroom || !selectedTerm) return;
    try {
      const enrollmentsRes = await apiClient.get<any[]>("/infrastructure/enrollments/", {
        params: { class_id: selectedClassroom, status: "active" },
      });
      const studentList = (enrollmentsRes.data || [])
        .map((e: any) => e.student || e.students)
        .filter(Boolean);
      setStudents(studentList);

      // Grades for analytics tab
      const studentIds = studentList.map((s: Student) => s.id);
      if (studentIds.length > 0) {
        const gradesRes = await apiClient.get<any[]>("/grades/", {
          params: { student_ids: studentIds },
        }).catch(() => ({ data: [] }));
        const gradesMap = new Map<string, GradeData[]>();
        (gradesRes.data || []).forEach((g: any) => {
          const sg = gradesMap.get(g.student_id) || [];
          sg.push({
            student_id: g.student_id,
            subject_name: g.subject_name || g.assessments?.subjects?.name || "Matière",
            score: g.score,
            max_score: g.max_score || 20,
            coefficient: g.coefficient || g.assessments?.subjects?.coefficient || 1,
            weight: g.weight || 1,
          });
          gradesMap.set(g.student_id, sg);
        });
        setStudentGrades(gradesMap);
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les élèves", variant: "destructive" });
    }
  };

  useEffect(() => { fetchData(); }, [tenant]);
  useEffect(() => { fetchStudentsAndGrades(); }, [selectedClassroom, selectedTerm]);

  // ── Average for analytics (local calculation) ───────────────────────────────

  const calculateAverage = (studentId: string): string => {
    const grades = studentGrades.get(studentId) || [];
    if (grades.length === 0) return "—";
    const engineGrades: EngineGrade[] = grades.map(g => ({
      score: g.score || 0, max_score: g.max_score, weight: g.weight,
      subject_id: "", subject_name: g.subject_name, coefficient: g.coefficient,
    }));
    const bySubject = new Map<string, EngineGrade[]>();
    engineGrades.forEach(g => {
      const list = bySubject.get(g.subject_name) || [];
      list.push(g);
      bySubject.set(g.subject_name, list);
    });
    let totalWeighted = 0, totalCoeff = 0;
    bySubject.forEach(sGrades => {
      const avg = pedagogicalEngine.calculateAverage(sGrades);
      const coeff = sGrades[0].coefficient;
      totalWeighted += avg * coeff;
      totalCoeff += coeff;
    });
    if (totalCoeff === 0) return "—";
    return (totalWeighted / totalCoeff).toFixed(2);
  };

  // ── Generate single bulletin (v2 endpoint) ──────────────────────────────────

  const generateBulletin = async (studentId: string) => {
    setGenerating(studentId);
    try {
      const response = await apiClient.post("/school-life/generate-report-card/v2/", {
        student_id: studentId,
        term_id: selectedTerm,
        classroom_id: selectedClassroom,
        director_comment: directorComment || undefined,
        decision: decision || undefined,
        show_guinea_header: showGuineaHeader,
      });
      const data = response.data;
      if (data?.html) {
        const student = students.find(s => s.id === studentId);
        const term = terms.find(t => t.id === selectedTerm);
        const name = `${student?.last_name}_${student?.first_name}`.replace(/\s+/g, "_");
        const termName = (term?.name || "trimestre").replace(/\s+/g, "_");
        openOrDownload(data.html, `bulletin_${name}_${termName}.html`, toast);
        toast({ title: "Bulletin généré ✅", description: `${data.student_name} — Moy. ${data.average || "—"}/20 — Rang ${data.rank || "—"}/${data.class_total || "—"}` });
      }
    } catch (err: any) {
      toast({
        title: "Erreur de génération",
        description: err.response?.data?.detail || "Réessayez dans quelques instants",
        variant: "destructive",
      });
    } finally {
      setGenerating(null);
    }
  };

  // ── Generate all bulletins (batch endpoint) ─────────────────────────────────

  const generateAllBulletins = async () => {
    if (students.length === 0) return;
    setGenerating("batch");
    toast({ title: "Génération en cours...", description: `Préparation de ${students.length} bulletins` });
    try {
      const response = await apiClient.post("/school-life/generate-report-cards/batch/", {
        classroom_id: selectedClassroom,
        term_id: selectedTerm,
        director_comment: directorComment || undefined,
        decision: decision || undefined,
        show_guinea_header: showGuineaHeader,
      });
      const data = response.data;
      if (data?.html) {
        const term = terms.find(t => t.id === selectedTerm);
        const classroom = classrooms.find(c => c.id === selectedClassroom);
        const termName = (term?.name || "trimestre").replace(/\s+/g, "_");
        const className = (classroom?.name || "classe").replace(/\s+/g, "_");
        openOrDownload(data.html, `bulletins_${className}_${termName}_${data.count}eleves.html`, toast);
        toast({
          title: `${data.count} bulletins générés ✅`,
          description: "Cliquez 'Imprimer' dans la fenêtre ouverte → 'Enregistrer en PDF'",
        });
      }
    } catch (err: any) {
      toast({
        title: "Erreur génération groupée",
        description: err.response?.data?.detail || "Réessayez dans quelques instants",
        variant: "destructive",
      });
    } finally {
      setGenerating(null);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!tenant) {
    return (
      <Card className="border-warning/50 bg-warning/5">
        <CardContent className="p-6">
          <p className="text-muted-foreground">Veuillez d'abord configurer votre établissement.</p>
        </CardContent>
      </Card>
    );
  }

  const selectedTermName = terms.find(t => t.id === selectedTerm)?.name || "Trimestre";
  const selectedClassroomName = classrooms.find(c => c.id === selectedClassroom)?.name || "";

  return (
    <div className="space-y-6">

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Bulletins de Notes</h1>
          <p className="text-muted-foreground">
            Format officiel Guinée · Rang · Absences · Décision du conseil
          </p>
        </div>
        <Badge variant="outline" className="border-green-500 text-green-700 bg-green-50 px-3 py-1.5">
          🇬🇳 République de Guinée
        </Badge>
      </div>

      {/* ── Filters + Batch generate ──────────────────────────────────── */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Trimestre / Période</Label>
              <Select value={selectedTerm} onValueChange={setSelectedTerm}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un trimestre" />
                </SelectTrigger>
                <SelectContent>
                  {terms.map((term) => (
                    <SelectItem key={term.id} value={term.id}>
                      {term.name} {term.academic_year ? `(${term.academic_year.name})` : ""}
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
            <div className="flex items-end gap-2">
              <Button
                onClick={generateAllBulletins}
                disabled={students.length === 0 || generating === "batch"}
                className="flex-1"
              >
                {generating === "batch" ? (
                  <span className="animate-pulse">Génération...</span>
                ) : (
                  <>
                    <Printer className="w-4 h-4 mr-2" />
                    Tous les bulletins ({students.length})
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* ── Council options (collapsible) ─────────────────────────── */}
          <div className="border rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowCouncilOptions(!showCouncilOptions)}
              className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium"
            >
              <span className="flex items-center gap-2">
                <Award className="w-4 h-4 text-primary" />
                Décision du conseil de classe &amp; options
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showCouncilOptions ? "rotate-180" : ""}`} />
            </button>

            {showCouncilOptions && (
              <div className="p-4 space-y-4 border-t bg-muted/10">
                <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50 border border-blue-200">
                  <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700">
                    La décision et l'appréciation s'appliquent à <strong>tous les bulletins</strong> générés depuis cette page.
                    Pour des décisions individualisées, générez les bulletins un par un.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="decision">Décision du conseil de classe</Label>
                    <Select value={decision} onValueChange={setDecision}>
                      <SelectTrigger id="decision">
                        <SelectValue placeholder="— À déterminer —" />
                      </SelectTrigger>
                      <SelectContent>
                        {DECISIONS.map((d) => (
                          <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dirComment">Appréciation générale du professeur principal</Label>
                    <Textarea
                      id="dirComment"
                      value={directorComment}
                      onChange={(e) => setDirectorComment(e.target.value)}
                      placeholder="Trimestre satisfaisant, des efforts notables en mathématiques..."
                      rows={2}
                      className="text-sm resize-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Switch
                    id="guineaHeader"
                    checked={showGuineaHeader}
                    onCheckedChange={setShowGuineaHeader}
                  />
                  <Label htmlFor="guineaHeader" className="cursor-pointer">
                    Afficher l'en-tête officielle « République de Guinée »
                  </Label>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="reports" className="space-y-4">
        <TabsList>
          <TabsTrigger value="reports">
            <FileText className="w-4 h-4 mr-2" />
            Bulletins individuels
          </TabsTrigger>
          <TabsTrigger value="overview">
            <BarChart3 className="w-4 h-4 mr-2" />
            Analyse des résultats
          </TabsTrigger>
        </TabsList>

        {/* ── Bulletins individuels ──────────────────────────────────── */}
        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                {selectedClassroomName && <span>{selectedClassroomName} — </span>}
                {StudentsLabel}
              </CardTitle>
              <CardDescription>
                {students.length} {students.length > 1 ? studentsLabel : studentLabel} inscrit(s)
                {selectedTermName ? ` · ${selectedTermName}` : ""}
                {" · "}
                <span className="text-primary font-medium">
                  Données récupérées en temps réel (rang, absences, notes)
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Chargement...</div>
              ) : students.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <GraduationCap className="w-12 h-12 mx-auto mb-4 opacity-40" />
                  <p>Aucun {studentLabel} inscrit dans cette classe</p>
                  <p className="text-xs mt-1">Sélectionnez une autre classe ou vérifiez les inscriptions</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Matricule</TableHead>
                      <TableHead>Nom &amp; Prénom</TableHead>
                      <TableHead>Moy. estimée</TableHead>
                      <TableHead className="text-right">Bulletin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map((student) => {
                      const avg = calculateAverage(student.id);
                      const avgNum = parseFloat(avg);
                      const isGenerating = generating === student.id;
                      return (
                        <TableRow key={student.id}>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {student.registration_number || "—"}
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold">{student.last_name}</span>{" "}
                            <span>{student.first_name}</span>
                          </TableCell>
                          <TableCell>
                            {avg !== "—" ? (
                              <span
                                className="font-bold"
                                style={{
                                  color: avgNum >= 14 ? "#166534"
                                    : avgNum >= 10 ? "#1d4ed8"
                                    : "#991b1b"
                                }}
                              >
                                {avg}<span className="text-muted-foreground font-normal">/20</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => generateBulletin(student.id)}
                              disabled={!!generating}
                            >
                              {isGenerating ? (
                                <span className="animate-pulse text-xs">Génération...</span>
                              ) : (
                                <>
                                  <Download className="w-3.5 h-3.5 mr-1.5" />
                                  Bulletin officiel
                                </>
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Analytics ─────────────────────────────────────────────── */}
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
      </Tabs>
    </div>
  );
};

export default ReportCards;
