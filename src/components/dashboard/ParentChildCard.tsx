import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  User,
  BookOpen,
  CalendarCheck,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTenantUrl } from "@/hooks/useTenantUrl";

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  registration_number: string | null;
  photo_url: string | null;
}

interface ParentChildCardProps {
  student: Student;
  tenantId: string;
}

export const ParentChildCard = ({ student, tenantId }: ParentChildCardProps) => {
  const { getTenantUrl } = useTenantUrl();

  // Fetch enrollment info
  const { data: enrollment } = useQuery({
    queryKey: ["student-enrollment", student.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select(`
          *,
          classrooms (name),
          levels (name)
        `)
        .eq("student_id", student.id)
        .eq("status", "active")
        .single();

      if (error) return null;
      return data;
    },
  });

  // Fetch recent grades
  const { data: gradesStats } = useQuery({
    queryKey: ["student-grades-stats", student.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grades")
        .select(`
          score,
          assessments (max_score, name, subjects (name))
        `)
        .eq("student_id", student.id)
        .not("score", "is", null);

      if (error) return { average: 0, count: 0 };

      if (!data || data.length === 0) return { average: 0, count: 0 };

      let totalNormalized = 0;
      let count = 0;

      data.forEach((grade: any) => {
        if (grade.score !== null && grade.assessments?.max_score) {
          totalNormalized += (grade.score / grade.assessments.max_score) * 20;
          count++;
        }
      });

      return {
        average: count > 0 ? totalNormalized / count : 0,
        count,
      };
    },
  });

  // Fetch attendance stats (last 30 days)
  const { data: attendanceStats } = useQuery({
    queryKey: ["student-attendance-stats", student.id],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from("attendance")
        .select("status")
        .eq("student_id", student.id)
        .gte("date", thirtyDaysAgo.toISOString().split("T")[0]);

      if (error) return { present: 0, absent: 0, late: 0, total: 0, rate: 0 };

      const stats = {
        present: data.filter(a => a.status === "PRESENT").length,
        absent: data.filter(a => a.status === "ABSENT").length,
        late: data.filter(a => a.status === "LATE").length,
        excused: data.filter(a => a.status === "EXCUSED").length,
        total: data.length,
        rate: 0,
      };

      stats.rate = stats.total > 0
        ? ((stats.present + stats.excused) / stats.total) * 100
        : 100;

      return stats;
    },
  });

  // Fetch pending homework
  const { data: homeworkStats } = useQuery({
    queryKey: ["student-homework-stats", student.id, enrollment?.class_id],
    queryFn: async () => {
      if (!enrollment?.class_id) return { pending: 0, submitted: 0, graded: 0 };

      const today = new Date().toISOString().split("T")[0];

      // Get homework for the classroom
      const { data: homework, error: hwError } = await supabase
        .from("homework")
        .select("id")
        .eq("class_id", enrollment.class_id)
        .eq("is_published", true)
        .gte("due_date", today);

      if (hwError || !homework) return { pending: 0, submitted: 0, graded: 0 };

      const homeworkIds = homework.map(h => h.id);

      if (homeworkIds.length === 0) return { pending: 0, submitted: 0, graded: 0 };

      // Get submissions
      const { data: submissions } = await supabase
        .from("homework_submissions")
        .select("homework_id, grade")
        .eq("student_id", student.id)
        .in("homework_id", homeworkIds);

      const submittedIds = submissions?.map(s => s.homework_id) || [];
      const gradedCount = submissions?.filter(s => s.grade !== null).length || 0;

      return {
        pending: homeworkIds.filter(id => !submittedIds.includes(id)).length,
        submitted: submittedIds.length,
        graded: gradedCount,
      };
    },
    enabled: !!enrollment?.class_id,
  });

  const getAverageColor = (avg: number) => {
    if (avg >= 14) return "text-success";
    if (avg >= 10) return "text-primary";
    if (avg >= 8) return "text-warning";
    return "text-destructive";
  };

  const getAttendanceColor = (rate: number) => {
    if (rate >= 90) return "text-success";
    if (rate >= 75) return "text-warning";
    return "text-destructive";
  };

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 pb-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary/20">
            {student.photo_url ? (
              <img
                src={student.photo_url}
                alt={`${student.first_name} ${student.last_name}`}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <span className="text-xl font-bold text-primary">
                {student.first_name[0]}{student.last_name[0]}
              </span>
            )}
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg">
              {student.first_name} {student.last_name}
            </CardTitle>
            <div className="flex items-center gap-2 mt-1">
              {enrollment && (
                <Badge variant="secondary" className="text-xs">
                  {(enrollment.classrooms as any)?.name || (enrollment.levels as any)?.name}
                </Badge>
              )}
              {student.registration_number && (
                <span className="text-xs text-muted-foreground">
                  {student.registration_number}
                </span>
              )}
            </div>
          </div>
          <Link
            to={getTenantUrl(`/parent/children/${student.id}`)}
            className="text-sm text-primary hover:underline"
          >
            Voir détails
          </Link>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Performance Grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Average Grade */}
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Moyenne</span>
            </div>
            <div className={`text-2xl font-bold ${getAverageColor(gradesStats?.average || 0)}`}>
              {gradesStats?.average ? gradesStats.average.toFixed(1) : "--"}/20
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {gradesStats?.count || 0} évaluations
            </p>
          </div>

          {/* Attendance Rate */}
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <CalendarCheck className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Présence</span>
            </div>
            <div className={`text-2xl font-bold ${getAttendanceColor(attendanceStats?.rate || 100)}`}>
              {attendanceStats?.rate?.toFixed(0) || 100}%
            </div>
            <Progress
              value={attendanceStats?.rate || 100}
              className="h-1.5 mt-2"
            />
          </div>
        </div>

        {/* Attendance Details */}
        {attendanceStats && attendanceStats.total > 0 && (
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1 text-success">
              <CheckCircle2 className="w-3 h-3" />
              {attendanceStats.present} présent
            </div>
            <div className="flex items-center gap-1 text-destructive">
              <XCircle className="w-3 h-3" />
              {attendanceStats.absent} absent
            </div>
            <div className="flex items-center gap-1 text-warning">
              <Clock className="w-3 h-3" />
              {attendanceStats.late} retard
            </div>
          </div>
        )}

        {/* Homework Status */}
        {homeworkStats && (homeworkStats.pending > 0 || homeworkStats.submitted > 0) && (
          <div className="border-t border-border pt-3">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Devoirs</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              {homeworkStats.pending > 0 && (
                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  {homeworkStats.pending} à rendre
                </Badge>
              )}
              {homeworkStats.submitted > 0 && (
                <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  {homeworkStats.submitted} rendu(s)
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
