import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";
import { Users, TrendingUp, BookOpen, ClipboardCheck } from "lucide-react";
import { useStudentLabel } from "@/hooks/useStudentLabel";

const COLORS = ['hsl(217, 91%, 40%)', 'hsl(199, 89%, 48%)', 'hsl(142, 76%, 36%)', 'hsl(38, 92%, 50%)', 'hsl(16, 85%, 57%)', 'hsl(168, 76%, 42%)'];

export const TeacherDashboardCharts = () => {
  const { tenant } = useTenant();
  const { user } = useAuth();
  const { StudentsLabel, studentsLabel } = useStudentLabel();

  // Get classrooms with student counts
  const { data: classroomStats } = useQuery({
    queryKey: ["teacher-classroom-stats", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data: classroomsData } = await apiClient.get('/classrooms/', {
        params: { tenant_id: tenant.id },
      });
      const classrooms = classroomsData.data || classroomsData || [];

      const stats = await Promise.all(
        classrooms.map(async (classroom: any) => {
          const { data: countData } = await apiClient.get('/enrollments/', {
            params: { class_id: classroom.id, status: 'active', count_only: 'true' },
          });
          return { name: classroom.name, effectif: (countData?.data?.count || countData?.count) || 0 };
        })
      );

      return stats.filter(s => s.effectif > 0).slice(0, 8);
    },
    enabled: !!tenant?.id,
  });

  // Get grade distribution for assessments created by teacher
  const { data: gradeDistribution } = useQuery({
    queryKey: ["teacher-grade-distribution", tenant?.id, user?.id],
    queryFn: async () => {
      if (!tenant?.id || !user?.id) return [];

      const { data: assessmentsData } = await apiClient.get('/assessments/', {
        params: { tenant_id: tenant.id, created_by: user.id },
      });
      const assessments = assessmentsData.data || assessmentsData || [];
      if (!assessments.length) return [];

      const assessmentIds = assessments.map((a: any) => a.id);

      const { data: gradesData } = await apiClient.get('/grades/', {
        params: { assessment_ids: assessmentIds.join(',') },
      });
      const grades = gradesData.data || gradesData || [];

      // Calculate distribution
      const distribution: Record<string, number> = {
        "Excellent (16-20)": 0,
        "Bien (14-16)": 0,
        "Assez Bien (12-14)": 0,
        "Passable (10-12)": 0,
        "Insuffisant (<10)": 0,
      };

      grades?.forEach((grade) => {
        const assessment = assessments.find(a => a.id === grade.assessment_id);
        if (grade.score !== null && assessment) {
          const normalized = (grade.score / (assessment.max_score || 20)) * 20;
          if (normalized >= 16) distribution["Excellent (16-20)"]++;
          else if (normalized >= 14) distribution["Bien (14-16)"]++;
          else if (normalized >= 12) distribution["Assez Bien (12-14)"]++;
          else if (normalized >= 10) distribution["Passable (10-12)"]++;
          else distribution["Insuffisant (<10)"]++;
        }
      });

      return Object.entries(distribution)
        .map(([name, value]) => ({ name, value }))
        .filter(item => item.value > 0);
    },
    enabled: !!tenant?.id && !!user?.id,
  });

  // Get class averages
  const { data: classAverages } = useQuery({
    queryKey: ["teacher-class-averages", tenant?.id, user?.id],
    queryFn: async () => {
      if (!tenant?.id || !user?.id) return [];

      const { data: gradesData } = await apiClient.get('/grades/', {
        params: { tenant_id: tenant.id },
      });
      const grades = gradesData.data || gradesData || [];

      // Filter for teacher's assessments and calculate averages
      const classScores: Record<string, { total: number; count: number }> = {};

      grades?.forEach((g: any) => {
        if (g.score !== null && g.assessment?.created_by === user.id && g.assessment?.classroom?.name) {
          const className = g.assessment.classroom.name;
          const maxScore = g.assessment.max_score || 20;
          const normalizedScore = (g.score / maxScore) * 20;

          if (!classScores[className]) {
            classScores[className] = { total: 0, count: 0 };
          }
          classScores[className].total += normalizedScore;
          classScores[className].count++;
        }
      });

      return Object.entries(classScores)
        .map(([name, { total, count }]) => ({
          name,
          moyenne: Number((total / count).toFixed(2)),
        }))
        .sort((a, b) => b.moyenne - a.moyenne);
    },
    enabled: !!tenant?.id && !!user?.id,
  });

  // Get attendance stats for today
  const { data: attendanceStats } = useQuery({
    queryKey: ["teacher-attendance-stats", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;

      const today = new Date().toISOString().split('T')[0];

      const { data: attendanceData } = await apiClient.get('/attendance/', {
        params: { tenant_id: tenant.id, date: today },
      });
      const data = attendanceData.data || attendanceData || [];

      const counts = { present: 0, absent: 0, late: 0, excused: 0 };
      data?.forEach((a) => {
        if (a.status === "PRESENT") counts.present++;
        else if (a.status === "ABSENT") counts.absent++;
        else if (a.status === "LATE") counts.late++;
        else if (a.status === "EXCUSED") counts.excused++;
      });

      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      return { ...counts, total, rate: total ? Math.round((counts.present / total) * 100) : 0 };
    },
    enabled: !!tenant?.id,
  });

  const totalStudents = classroomStats?.reduce((a, b) => a + b.effectif, 0) || 0;
  const overallAverage = classAverages?.length
    ? (classAverages.reduce((a, b) => a + b.moyenne, 0) / classAverages.length).toFixed(1)
    : "—";

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalStudents}</p>
                <p className="text-xs text-muted-foreground">{StudentsLabel}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{overallAverage}</p>
                <p className="text-xs text-muted-foreground">Moyenne</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-info" />
              </div>
              <div>
                <p className="text-2xl font-bold">{classroomStats?.length || 0}</p>
                <p className="text-xs text-muted-foreground">Classes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                <ClipboardCheck className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{attendanceStats?.rate || 0}%</p>
                <p className="text-xs text-muted-foreground">Présence (auj.)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Students by Classroom */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Effectifs par Classe</CardTitle>
          </CardHeader>
          <CardContent>
            {classroomStats && classroomStats.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={classroomStats} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="effectif" fill="hsl(217, 91%, 40%)" radius={[4, 4, 0, 0]} name={StudentsLabel} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                Aucune donnée disponible
              </div>
            )}
          </CardContent>
        </Card>

        {/* Grade Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Répartition des Notes</CardTitle>
          </CardHeader>
          <CardContent>
            {gradeDistribution && gradeDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={gradeDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {gradeDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                Aucune note saisie
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Class Averages */}
      {classAverages && classAverages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Moyennes par Classe</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={classAverages} layout="vertical" margin={{ top: 10, right: 30, left: 60, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" domain={[0, 20]} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                  formatter={(value: number) => [`${value}/20`, "Moyenne"]}
                />
                <Bar dataKey="moyenne" fill="hsl(142, 76%, 36%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
