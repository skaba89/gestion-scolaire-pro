import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import axios from "axios";
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
import { PerformanceAnalytics, type SubjectStat } from "@/components/reports/PerformanceAnalytics";
import { useStudentLabel } from "@/hooks/useStudentLabel";

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

interface OfficialResult {
  average: string | null;
  rank: number;
  /** Couleur du bulletin PDF selon les règles du niveau (null sans moyenne). */
  color?: string | null;
}

interface ClassSummary {
  class_total: number;
  passing_grade: number;
  items: ({ student_id: string } & OfficialResult)[];
  subjects: SubjectStat[];
}

// ── Décision choices ────────────────────────────────────────────────────────────

function getDecisions(t: (k: string) => string) {
  return [
    { value: "", label: t("reportCards.decisionUndetermined") },
    { value: "Passage", label: t("reportCards.decisionPromotion") },
    { value: "Félicitations", label: t("reportCards.decisionCongratulations") },
    { value: "Encouragements", label: t("reportCards.decisionEncouragement") },
    { value: "Avertissement", label: t("reportCards.decisionWarning") },
    { value: "Redoublement", label: t("reportCards.decisionRepeat") },
  ];
}

// ── Helper: open bulletin in new tab or download ────────────────────────────────

function openOrDownload(base64Html: string, filename: string, toast: any, t: (k: string) => string) {
  const decodedHtml = atob(base64Html);
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(decodedHtml);
    printWindow.document.close();
    setTimeout(() => { try { printWindow.print(); } catch { /* Window may close before printing. */ } }, 700);
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
      title: t("messages.reportCardDownloaded"),
      description: t("messages.reportCardDownloadHint"),
    });
  }
}

// ── Main Component ─────────────────────────────────────────────────────────────

const ReportCards = () => {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { studentLabel, StudentsLabel, studentsLabel } = useStudentLabel();
  const DECISIONS = getDecisions(t);

  const [selectedTerm, setSelectedTerm] = useState("");
  const [selectedClassroom, setSelectedClassroom] = useState("");
  const [generating, setGenerating] = useState<string | null>(null); // studentId or "batch"

  // Council decision (applied to all bulletins in this batch)
  const [decision, setDecision] = useState("");
  const [directorComment, setDirectorComment] = useState("");
  const [showGuineaHeader, setShowGuineaHeader] = useState(true);
  const [showCouncilOptions, setShowCouncilOptions] = useState(false);

  // ── Data loading via React Query ──────────────────────────────────────────────

  const { data: terms = [], isLoading: termsLoading } = useQuery({
    queryKey: ["report-cards", "terms", tenant?.id],
    queryFn: () =>
      apiClient.get<any[]>("/terms/").then((r) =>
        (r.data || []).map((t: any) => ({ ...t, academic_year: t.academic_year || t.academic_years }))
      ),
    enabled: !!tenant,
  });

  const { data: classrooms = [], isLoading: classroomsLoading } = useQuery({
    queryKey: ["report-cards", "classrooms", tenant?.id],
    queryFn: () =>
      apiClient.get<any[]>("/infrastructure/classrooms/").then((r) =>
        (r.data || []).map((c: any) => ({ ...c, level: c.level || c.levels }))
      ),
    enabled: !!tenant,
  });

  // Set initial selection once data arrives
  useEffect(() => {
    if (terms.length > 0 && !selectedTerm) setSelectedTerm(terms[0].id);
  }, [terms]);
  useEffect(() => {
    if (classrooms.length > 0 && !selectedClassroom) setSelectedClassroom(classrooms[0].id);
  }, [classrooms]);

  const { data: enrollmentData, isLoading: enrollmentLoading } = useQuery({
    queryKey: ["report-cards", "enrollments", tenant?.id, selectedClassroom, selectedTerm],
    queryFn: async () => {
      const enrollmentsRes = await apiClient.get<any[]>("/infrastructure/enrollments/", {
        params: { class_id: selectedClassroom, status: "active" },
      });
      const enrollments = (enrollmentsRes.data || []).filter(
        (e: any) => e.class_id === selectedClassroom
      );
      // Le roster vient de l'inscription elle-même (`student` embarqué par
      // l'API). Auparavant, il était croisé avec GET /students/?page_size=100,
      // limité aux 100 élèves les plus récents de l'établissement : au-delà,
      // des inscrits de la classe disparaissaient de la liste des bulletins
      // et du compteur « Tous les bulletins », sans aucune erreur visible.
      const studentsById = new Map<string, Student>();
      for (const e of enrollments) {
        const s = e.student;
        if (s?.id && !studentsById.has(s.id)) {
          studentsById.set(s.id, {
            id: s.id,
            first_name: s.first_name,
            last_name: s.last_name,
            registration_number: s.registration_number ?? null,
          });
        }
      }
      const studentList = Array.from(studentsById.values());
      return studentList;
    },
    enabled: !!tenant && !!selectedClassroom && !!selectedTerm,
  });

  // Moyenne et rang officiels : même calcul serveur que le bulletin HTML/PDF
  // (REPORT-CARDS-SUMMARY-01). L'ancienne « Moy. estimée » était recalculée
  // ici sur toutes les notes de l'élève, toutes périodes confondues.
  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
  } = useQuery({
    queryKey: ["report-cards", "class-summary", tenant?.id, selectedClassroom, selectedTerm],
    queryFn: async () => {
      const res = await apiClient.get<ClassSummary>("/school-life/report-cards/class-summary/", {
        params: { classroom_id: selectedClassroom, term_id: selectedTerm },
      });
      return {
        classTotal: res.data.class_total,
        byStudent: new Map(res.data.items.map((item) => [item.student_id, item])),
        // Onglet « Analyse » : mêmes valeurs officielles, pour la période.
        averages: res.data.items
          .map((item) => (item.average === null ? null : Number(item.average)))
          .filter((v): v is number => v !== null),
        passingGrade: res.data.passing_grade,
        subjects: res.data.subjects ?? [],
      };
    },
    enabled: !!tenant && !!selectedClassroom && !!selectedTerm,
  });

  const students = enrollmentData ?? [];

  const loading = termsLoading || classroomsLoading || enrollmentLoading;

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
        openOrDownload(data.html, `bulletin_${name}_${termName}.html`, toast, t);
        toast({ title: t("messages.reportCardGenerated"), description: `${data.student_name} — Moy. ${data.average || "—"}/20 — Rang ${data.rank || "—"}/${data.class_total || "—"}` });
      }
    } catch (err: any) {
      toast({
        title: t("messages.reportCardGenerateError"),
        description: err.response?.data?.detail || t("messages.retryLater"),
        variant: "destructive",
      });
    } finally {
      setGenerating(null);
    }
  };

  // ── Download real PDF (national-readiness audit, 2026-09, P1-1) ─────────────
  // Unlike generateBulletin() above (server HTML → browser print), this hits
  // the WeasyPrint-backed endpoint and gets back an actual PDF file — the
  // document a school issues is something the platform can archive, not
  // just render-and-print on demand.

  const downloadBulletinPdf = async (studentId: string) => {
    setGenerating(studentId);
    try {
      const response = await apiClient.post(
        "/school-life/generate-report-card/pdf/",
        {
          student_id: studentId,
          term_id: selectedTerm,
          classroom_id: selectedClassroom,
          director_comment: directorComment || undefined,
          decision: decision || undefined,
          show_guinea_header: showGuineaHeader,
        },
        { responseType: "blob" },
      );
      const student = students.find(s => s.id === studentId);
      const term = terms.find(t => t.id === selectedTerm);
      const name = `${student?.last_name}_${student?.first_name}`.replace(/\s+/g, "_");
      const termName = (term?.name || "trimestre").replace(/\s+/g, "_");

      const url = URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `Bulletin_${name}_${termName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      // responseType "blob" means an error response's body also arrives as
      // a Blob (even though the server sent JSON) rather than being parsed
      // for us — read it back out before falling back to a generic message.
      let detail: string | undefined;
      if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          detail = JSON.parse(text)?.detail;
        } catch {
          // Not JSON (or empty) — fall through to the generic message below.
        }
      }
      toast({
        title: t("messages.reportCardGenerateError"),
        description: detail || t("messages.retryLater"),
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
    toast({ title: t("messages.reportCardGenerating"), description: t("messages.reportCardBatchPreparing", { count: students.length }) });
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
        openOrDownload(data.html, `bulletins_${className}_${termName}_${data.count}eleves.html`, toast, t);
        toast({
          title: t("messages.reportCardBatchGenerated", { count: data.count }),
          description: t("messages.reportCardBatchHint"),
        });
      }
    } catch (err: any) {
      toast({
        title: t("messages.reportCardBatchError"),
        description: err.response?.data?.detail || t("messages.retryLater"),
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
                <>
                {summaryError && (
                  <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    Impossible de charger les moyennes et rangs officiels. Réessayez ; les bulletins restent générables.
                  </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Matricule</TableHead>
                      <TableHead>Nom &amp; Prénom</TableHead>
                      <TableHead>Moyenne</TableHead>
                      <TableHead>Rang</TableHead>
                      <TableHead className="text-right">Bulletin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map((student) => {
                      const official = summary?.byStudent.get(student.id);
                      const avg = official?.average ?? null;
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
                            {summaryLoading ? (
                              <span className="text-muted-foreground text-sm">…</span>
                            ) : avg !== null ? (
                              <span
                                className="font-bold"
                                // Couleur calculée par le serveur avec les règles
                                // académiques du niveau (identique au bulletin PDF).
                                style={official?.color ? { color: official.color } : undefined}
                              >
                                {avg}<span className="text-muted-foreground font-normal">/20</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {official && official.rank > 0 ? (
                              <span>
                                {official.rank}<sup>e</sup>
                                <span className="text-muted-foreground">/{summary?.classTotal}</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
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
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => downloadBulletinPdf(student.id)}
                              disabled={!!generating}
                              title="Télécharger un fichier PDF réel (archivable), plutôt que la version imprimable du navigateur"
                            >
                              {isGenerating ? (
                                <span className="animate-pulse text-xs">Génération...</span>
                              ) : (
                                <>
                                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                                  PDF
                                </>
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Analytics ─────────────────────────────────────────────── */}
        <TabsContent value="overview">
          {loading || summaryLoading ? (
            <div className="text-center py-12">Chargement des données...</div>
          ) : summaryError || !summary ? (
            <div role="alert" className="text-center py-12 text-destructive">
              Impossible de charger les résultats officiels de la classe.
            </div>
          ) : (
            <PerformanceAnalytics
              averages={summary.averages}
              passingGrade={summary.passingGrade}
              subjects={summary.subjects}
              termName={selectedTermName}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ReportCards;
