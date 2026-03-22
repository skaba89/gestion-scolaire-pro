import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  ArrowLeft,
  User,
  Calendar,
  Phone,
  MapPin,
  Mail,
  BookOpen,
  ClipboardCheck,
  FileText,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Download
} from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { fr } from "date-fns/locale";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

import { useTenantUrl } from "@/hooks/useTenantUrl";
import { StudentDigitalBadge } from "@/components/student/StudentDigitalBadge";
import { CheckInHistoryList } from "@/components/attendance/CheckInHistoryList";
import { parentsService } from "@/features/parents/services/parentsService";

const ChildDetail = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const { user } = useAuth();
  const { getTenantUrl } = useTenantUrl();

  // Verify parent has access to this student
  const { data: relation } = useQuery({
    queryKey: ["parent-student-relation", user?.id, studentId],
    queryFn: async () => {
      if (!user?.id || !studentId) return null;
      const { data, error } = await supabase
        .from("parent_students")
        .select("*")
        .eq("parent_id", user.id)
        .eq("student_id", studentId)
        .single();

      if (error) return null;
      return data;
    },
    enabled: !!user?.id && !!studentId,
  });

  // Fetch student details via parentsService
  const { data: student, isLoading: isLoadingStudent } = useQuery({
    queryKey: ["student-details", studentId],
    queryFn: () => parentsService.getStudentDetails(studentId || ""),
    enabled: !!studentId && !!relation,
  });

  // Fetch enrollment via parentsService
  const { data: enrollment } = useQuery({
    queryKey: ["student-enrollment-detail", studentId],
    queryFn: () => parentsService.getStudentEnrollment(studentId || ""),
    enabled: !!studentId && !!relation,
  });

  const [isGeneratingTranscript, setIsGeneratingTranscript] = useState(false);

  // Fetch all grades via parentsService
  const { data: grades } = useQuery({
    queryKey: ["student-all-grades-detailed", studentId],
    queryFn: () => parentsService.getStudentAllGradesDetailed(studentId || ""),
    enabled: !!studentId && !!relation,
  });

  // Fetch all enrollments via parentsService
  const { data: allEnrollments } = useQuery({
    queryKey: ["student-all-enrollments", studentId],
    queryFn: () => parentsService.getStudentAllEnrollments(studentId || ""),
    enabled: !!studentId && !!relation,
  });

  const handleDownloadTranscript = async () => {
    try {
      setIsGeneratingTranscript(true);

      if (!grades || !allEnrollments || !student) {
        toast.error("Données incomplètes pour générer le relevé.");
        return;
      }

      // Group grades by Academic Year -> Subject
      const yearsMap = new Map();

      // Helper to find level for a year
      const getLevelForYear = (yearId: string) => {
        const enrollment = allEnrollments.find((e: any) => e.academic_year_id === yearId);
        return (enrollment?.levels as any)?.name || (enrollment?.classrooms as any)?.name || "N/A";
      };

      grades.forEach((grade: any) => {
        const term = grade.assessments?.terms;
        const year = term?.academic_years;
        const subject = grade.assessments?.subjects;

        if (!year || !subject) return;

        if (!yearsMap.has(year.id)) {
          yearsMap.set(year.id, {
            id: year.id,
            name: year.name,
            level: getLevelForYear(year.id),
            subjects: new Map(),
          });
        }

        const yearData = yearsMap.get(year.id);

        if (!yearData.subjects.has(subject.name)) {
          yearData.subjects.set(subject.name, {
            totalScore: 0,
            totalMax: 0,
            coefficient: subject.coefficient || 1,
            gradesCount: 0
          });
        }

        const subData = yearData.subjects.get(subject.name);
        // Normalize score to 20
        const max = grade.assessments?.max_score || 20;
        const score = grade.score || 0;
        const normalized = (score / max) * 20;

        subData.totalScore += normalized;
        subData.totalMax += 20; // We average normalized scores
        subData.gradesCount++;
      });

      // Format data for API
      const academicYears = Array.from(yearsMap.values()).map((year: any) => {
        let yearTotal = 0;
        let yearCoeffs = 0;

        const subjects = Array.from(year.subjects.entries()).map(([name, data]: any) => {
          const avg = data.totalScore / data.gradesCount;
          yearTotal += avg * data.coefficient;
          yearCoeffs += data.coefficient;

          return {
            name,
            average: avg.toFixed(2),
            coefficient: data.coefficient,
            appreciation: getAppreciation(avg)
          };
        });

        const annualAverage = yearCoeffs > 0 ? yearTotal / yearCoeffs : 0;

        return {
          name: year.name,
          level: year.level,
          average: annualAverage.toFixed(2),
          status: annualAverage >= 10 ? "ADMIS(E)" : "AJOURNÉ(E)",
          appreciation: getGeneralAppreciation(annualAverage),
          subjects: subjects.sort((a, b) => a.name.localeCompare(b.name))
        };
      }).sort((a, b) => b.name.localeCompare(a.name)); // Most recent first

      const transcriptData = {
        tenant: {
          name: "École", // Should fetch tenant info from context if available, or upgrade queries
          // using generic fallback for now as ChildDetail doesn't have full tenant object in props
          // but we can try to get it from cache or store.
          // For now, simpler:
          address: "Adresse de l'établissement"
        },
        student: {
          firstName: student.first_name,
          lastName: student.last_name,
          matricule: student.registration_number,
          dateOfBirth: student.date_of_birth ? format(new Date(student.date_of_birth), "dd/MM/yyyy") : "",
          gender: student.gender
        },
        academicYears
      };

      const { data, error } = await supabase.functions.invoke("generate-transcript", {
        body: transcriptData,
      });

      if (error) throw error;

      if (data?.html) {
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.write(data.html);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => {
            printWindow.print();
          }, 500);
        }
      }

    } catch (error: any) {
      console.error("Error generating transcript:", error);
      toast.error("Erreur lors de la génération du dossier scolaire");
    } finally {
      setIsGeneratingTranscript(false);
    }
  };

  const getAppreciation = (note: number) => {
    if (note >= 16) return "Excellent";
    if (note >= 14) return "Très Bien";
    if (note >= 12) return "Bien";
    if (note >= 10) return "Assez Bien";
    return "Insuffisant";
  };

  const getGeneralAppreciation = (note: number) => {
    if (note >= 10) return "Admis en classe supérieure";
    return "Redoublement";
  };

  // Fetch attendance history via parentsService
  const { data: attendance } = useQuery({
    queryKey: ["student-all-attendance", studentId],
    queryFn: () => parentsService.getStudentAllAttendance(studentId || ""),
    enabled: !!studentId && !!relation,
  });

  // Fetch detailed check-in history (scans) via parentsService
  const { data: checkInHistory, isLoading: isLoadingCheckIns } = useQuery({
    queryKey: ["child-check-ins", studentId],
    queryFn: () => parentsService.getChildCheckInHistory([studentId || ""]),
    enabled: !!studentId && !!relation,
  });

  // Calculate grades by subject
  const gradesBySubject = grades?.reduce((acc: any, grade: any) => {
    const subjectName = grade.assessments?.subjects?.name || "Autre";
    if (!acc[subjectName]) {
      acc[subjectName] = { grades: [], total: 0, count: 0 };
    }
    const normalized = (grade.score / (grade.assessments?.max_score || 20)) * 20;
    acc[subjectName].grades.push({ ...grade, normalized });
    acc[subjectName].total += normalized;
    acc[subjectName].count++;
    return acc;
  }, {});

  const subjectAverages = Object.entries(gradesBySubject || {}).map(([subject, data]: any) => ({
    subject,
    average: data.total / data.count,
    grades: data.grades,
  })).sort((a, b) => b.average - a.average);

  const overallAverage = subjectAverages.length > 0
    ? subjectAverages.reduce((sum, s) => sum + s.average, 0) / subjectAverages.length
    : 0;

  // Attendance statistics
  const attendanceStats = (() => {
    const stats = {
      present: attendance?.filter(a => a.status === "PRESENT").length || 0,
      absent: attendance?.filter(a => a.status === "ABSENT").length || 0,
      late: attendance?.filter(a => a.status === "LATE").length || 0,
      excused: attendance?.filter(a => a.status === "EXCUSED").length || 0,
      total: attendance?.length || 0,
      rate: 100,
    };
    stats.rate = stats.total > 0
      ? ((stats.present + stats.excused) / stats.total) * 100
      : 100;
    return stats;
  })();

  // Monthly attendance
  const currentMonth = new Date();
  const monthlyAttendance = attendance?.filter(a => {
    const date = new Date(a.date);
    return date >= startOfMonth(currentMonth) && date <= endOfMonth(currentMonth);
  }) || [];

  const getAverageColor = (avg: number) => {
    if (avg >= 14) return "text-success";
    if (avg >= 10) return "text-primary";
    if (avg >= 8) return "text-warning";
    return "text-destructive";
  };

  const getTrendIcon = (current: number, previous: number) => {
    if (current > previous + 0.5) return <TrendingUp className="w-4 h-4 text-success" />;
    if (current < previous - 0.5) return <TrendingDown className="w-4 h-4 text-destructive" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  if (!relation) {
    return (
      <div className="space-y-6">
        <Link to={getTenantUrl("/parent/children")}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 text-destructive/50 mx-auto mb-4" />
            <p className="text-muted-foreground">Vous n'avez pas accès à ce profil</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoadingStudent) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Link to={getTenantUrl("/parent/children")}>
        <Button variant="ghost" size="sm">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour à la liste
        </Button>
      </Link>

      {/* Student Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary/20">
              {student?.photo_url ? (
                <img
                  src={student.photo_url}
                  alt={`${student.first_name} ${student.last_name}`}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="text-2xl font-bold text-primary">
                  {student?.first_name?.[0]}{student?.last_name?.[0]}
                </span>
              )}
            </div>

            <div className="flex-1">
              <h1 className="text-2xl font-display font-bold">
                {student?.first_name} {student?.last_name}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {student?.registration_number && (
                  <Badge variant="outline">{student.registration_number}</Badge>
                )}
                {enrollment && (
                  <Badge variant="secondary">
                    {(enrollment.classrooms as any)?.name || (enrollment.levels as any)?.name}
                  </Badge>
                )}
                {enrollment && (
                  <Badge variant="outline" className="bg-muted">
                    {(enrollment.academic_years as any)?.name}
                  </Badge>
                )}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="flex gap-4">
              <div className="text-center">
                <div className={`text-2xl font-bold ${getAverageColor(overallAverage)}`}>
                  {overallAverage > 0 ? overallAverage.toFixed(1) : "--"}
                </div>
                <p className="text-xs text-muted-foreground">Moyenne</p>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold ${attendanceStats.rate >= 90 ? 'text-success' : attendanceStats.rate >= 75 ? 'text-warning' : 'text-destructive'}`}>
                  {attendanceStats.rate.toFixed(0)}%
                </div>
                <p className="text-xs text-muted-foreground">Présence</p>
              </div>

              <div className="flex flex-col justify-center">
                <StudentDigitalBadge
                  student={student as any}
                  className="py-2 px-4"
                />
              </div>
            </div>
          </div>

          {/* Student Info Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t">
            {student?.date_of_birth && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span>{format(new Date(student.date_of_birth), "dd MMM yyyy", { locale: fr })}</span>
              </div>
            )}
            {student?.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span className="truncate">{student.email}</span>
              </div>
            )}
            {student?.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span>{student.phone}</span>
              </div>
            )}
            {student?.address && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span className="truncate">{student.address}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="grades" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="grades" className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            <span className="hidden sm:inline">Notes</span>
          </TabsTrigger>
          <TabsTrigger value="attendance" className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4" />
            <span className="hidden sm:inline">Présences</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Bulletins</span>
          </TabsTrigger>
        </TabsList>

        {/* Grades Tab */}
        <TabsContent value="grades" className="space-y-4">
          {/* Performance Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Évolution des résultats
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[250px] pt-4">
              {grades && grades.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={grades
                      .slice(0, 15)
                      .reverse()
                      .map(g => ({
                        date: format(new Date(g.created_at), "dd/MM"),
                        score: (g.score / (g.assessments?.max_score || 20)) * 20,
                        subject: g.assessments?.subjects?.name
                      }))}
                  >
                    <defs>
                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground))" opacity={0.1} />
                    <XAxis
                      dataKey="date"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis
                      domain={[0, 20]}
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      ticks={[0, 5, 10, 15, 20]}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--background))',
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '12px',
                        fontSize: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                      }}
                      formatter={(value: number) => [value.toFixed(1) + "/20", "Moyenne"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="score"
                      stroke="hsl(var(--primary))"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorScore)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <TrendingUp className="w-12 h-12 mb-2 opacity-10" />
                  <p>Pas assez de données pour le graphique</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Subject Averages */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Moyennes par matière</CardTitle>
            </CardHeader>
            <CardContent>
              {subjectAverages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Aucune note enregistrée
                </div>
              ) : (
                <div className="space-y-4">
                  {subjectAverages.map((subject) => (
                    <div key={subject.subject} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{subject.subject}</span>
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${getAverageColor(subject.average)}`}>
                            {subject.average.toFixed(1)}/20
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {subject.grades.length} note(s)
                          </Badge>
                        </div>
                      </div>
                      <Progress
                        value={(subject.average / 20) * 100}
                        className="h-2"
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Grades */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Historique des notes</CardTitle>
            </CardHeader>
            <CardContent>
              {grades?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Aucune note enregistrée
                </div>
              ) : (
                <div className="space-y-3">
                  {grades?.slice(0, 20).map((grade: any) => (
                    <div
                      key={grade.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex-1">
                        <p className="font-medium">{grade.assessments?.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {grade.assessments?.subjects?.name} • {grade.assessments?.type}
                        </p>
                        {grade.assessments?.date && (
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(grade.assessments.date), "dd MMM yyyy", { locale: fr })}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className={`text-lg font-bold ${getAverageColor((grade.score / (grade.assessments?.max_score || 20)) * 20)}`}>
                          {grade.score}/{grade.assessments?.max_score || 20}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attendance Tab */}
        <TabsContent value="attendance" className="space-y-4">
          {/* Attendance Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <CheckCircle2 className="w-8 h-8 text-success mx-auto mb-2" />
                <p className="text-2xl font-bold">{attendanceStats.present}</p>
                <p className="text-sm text-muted-foreground">Présent</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <XCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
                <p className="text-2xl font-bold">{attendanceStats.absent}</p>
                <p className="text-sm text-muted-foreground">Absent</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Clock className="w-8 h-8 text-warning mx-auto mb-2" />
                <p className="text-2xl font-bold">{attendanceStats.late}</p>
                <p className="text-sm text-muted-foreground">Retard</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <AlertCircle className="w-8 h-8 text-info mx-auto mb-2" />
                <p className="text-2xl font-bold">{attendanceStats.excused}</p>
                <p className="text-sm text-muted-foreground">Excusé</p>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Scan History */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CheckInHistoryList checkIns={checkInHistory || []} isLoading={isLoadingCheckIns} />

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Historique des présences par jour</CardTitle>
              </CardHeader>
              <CardContent>
                {attendance?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Aucun enregistrement de présence
                  </div>
                ) : (
                  <div className="space-y-2">
                    {attendance?.slice(0, 30).map((record: any) => (
                      <div
                        key={record.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${record.status === "PRESENT" ? "bg-success" :
                            record.status === "ABSENT" ? "bg-destructive" :
                              record.status === "LATE" ? "bg-warning" :
                                "bg-info"
                            }`} />
                          <span className="font-medium">
                            {format(new Date(record.date), "EEEE dd MMMM yyyy", { locale: fr })}
                          </span>
                        </div>
                        <Badge variant={
                          record.status === "PRESENT" ? "default" :
                            record.status === "ABSENT" ? "destructive" :
                              record.status === "LATE" ? "secondary" :
                                "outline"
                        }>
                          {record.status === "PRESENT" ? "Présent" :
                            record.status === "ABSENT" ? "Absent" :
                              record.status === "LATE" ? "Retard" :
                                "Excusé"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-lg">Bulletins scolaires</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col items-center justify-center py-8">
                <FileText className="w-12 h-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground text-center mb-6">
                  Consultez et téléchargez les bulletins de notes trimestriels.
                </p>
                <Link to={getTenantUrl(`/parent/report-cards?student=${studentId}`)}>
                  <Button>
                    <FileText className="w-4 h-4 mr-2" />
                    Voir les bulletins
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-lg">Dossier Scolaire</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col items-center justify-center py-8">
                <BookOpen className="w-12 h-12 text-primary/50 mb-4" />
                <p className="text-muted-foreground text-center mb-6">
                  Téléchargez le relevé complet de toutes les années scolaires.
                </p>
                <Button
                  onClick={handleDownloadTranscript}
                  disabled={isGeneratingTranscript}
                  variant="outline"
                  className="border-primary text-primary hover:bg-primary/5"
                >
                  {isGeneratingTranscript ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2"></div>
                      Génération...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Télécharger le dossier complet
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ChildDetail;
