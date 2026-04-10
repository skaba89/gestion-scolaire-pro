import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Legend,
  LineChart,
  Line,
} from "recharts";
import {
  Users,
  TrendingUp,
  GraduationCap,
  UserCheck,
  UserX,
  Clock,
  Download,
  BarChart3,
  PieChart as PieChartIcon,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, eachMonthOfInterval } from "date-fns";
import { fr } from "date-fns/locale";
import { useStudentLabel } from "@/hooks/useStudentLabel";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

const EnrollmentStats = () => {
  const { tenant } = useTenant();
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const { studentLabel, StudentLabel, studentsLabel, StudentsLabel } = useStudentLabel();

  // Fetch academic years
  const { data: academicYears } = useQuery({
    queryKey: ["academic-years-stats", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data } = await apiClient.get("/students/academic-years/", {
        params: { ordering: "-start_date" },
      });
      return data;
    },
    enabled: !!tenant?.id,
  });

  // Fetch enrollments with details
  const { data: enrollments } = useQuery({
    queryKey: ["enrollments-stats", tenant?.id, selectedYear],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const params: Record<string, string> = { expand: "student,classroom,level,academic_year" };
      if (selectedYear !== "all") {
        params.academic_year_id = selectedYear;
      }
      const { data } = await apiClient.get("/admissions/enrollments/", { params });
      return data;
    },
    enabled: !!tenant?.id,
  });

  // Fetch students
  const { data: students } = useQuery({
    queryKey: ["students-stats", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data } = await apiClient.get("/students/");
      return data;
    },
    enabled: !!tenant?.id,
  });

  // Fetch admission applications
  const { data: applications } = useQuery({
    queryKey: ["applications-stats", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data } = await apiClient.get("/admissions/applications/");
      return data;
    },
    enabled: !!tenant?.id,
  });

  // Calculate statistics
  const stats = {
    totalStudents: (students as any[])?.filter(s => s.status === 'ACTIVE' && !s.deleted_at).length || 0,
    archivedStudents: (students as any[])?.filter(s => s.status === 'ARCHIVED' || s.deleted_at).length || 0,
    totalEnrollments: enrollments?.length || 0,
    activeEnrollments: enrollments?.filter(e => e.status === "ACTIVE").length || 0,
    pendingApplications: applications?.filter(a => a.status === "SUBMITTED" || a.status === "UNDER_REVIEW").length || 0,
    acceptedApplications: applications?.filter(a => a.status === "ACCEPTED" || a.status === "CONVERTED_TO_STUDENT").length || 0,
    rejectedApplications: applications?.filter(a => a.status === "REJECTED").length || 0,
  };

  // Enrollments by level
  const enrollmentsByLevel = enrollments?.reduce((acc: Record<string, number>, e) => {
    const levelName = (e.level as any)?.name || "Non assigné";
    acc[levelName] = (acc[levelName] || 0) + 1;
    return acc;
  }, {}) || {};

  const levelChartData = Object.entries(enrollmentsByLevel).map(([name, count]) => ({
    name,
    value: count,
  }));

  // Enrollments by classroom
  const enrollmentsByClassroom = enrollments?.reduce((acc: Record<string, number>, e) => {
    const classroomName = (e.classroom as any)?.name || "Non assigné";
    acc[classroomName] = (acc[classroomName] || 0) + 1;
    return acc;
  }, {}) || {};

  const classroomChartData = Object.entries(enrollmentsByClassroom).map(([name, count]) => ({
    name,
    count,
  })).sort((a, b) => b.count - a.count).slice(0, 10);

  // Gender distribution
  const genderStats = students?.reduce((acc: Record<string, number>, s) => {
    const gender = s.gender || "Non spécifié";
    acc[gender] = (acc[gender] || 0) + 1;
    return acc;
  }, {}) || {};

  const genderChartData = Object.entries(genderStats).map(([name, value]) => ({
    name: name === "M" ? "Masculin" : name === "F" ? "Féminin" : name,
    value,
  }));

  // Monthly registrations trend (last 12 months)
  const last12Months = eachMonthOfInterval({
    start: subMonths(new Date(), 11),
    end: new Date(),
  });

  const monthlyTrendData = last12Months.map(month => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const count = students?.filter(s => {
      const createdAt = new Date(s.created_at || "");
      return createdAt >= monthStart && createdAt <= monthEnd;
    }).length || 0;

    return {
      month: format(month, "MMM yy", { locale: fr }),
      inscriptions: count,
    };
  });

  // Application status distribution
  const applicationStatusData = [
    { name: "En attente", value: stats.pendingApplications, color: "#f59e0b" },
    { name: "Acceptées", value: stats.acceptedApplications, color: "#10b981" },
    { name: "Refusées", value: stats.rejectedApplications, color: "#ef4444" },
  ].filter(d => d.value > 0);

  const exportStats = () => {
    const data = {
      summary: stats,
      byLevel: enrollmentsByLevel,
      byClassroom: enrollmentsByClassroom,
      byGender: genderStats,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `statistiques-inscriptions-${format(new Date(), "yyyy-MM-dd")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Statistiques d'Inscription</h1>
          <p className="text-muted-foreground">Analyse détaillée des inscriptions et candidatures</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Année académique" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les années</SelectItem>
              {academicYears?.map((year) => (
                <SelectItem key={year.id} value={year.id}>
                  {year.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportStats}>
            <Download className="w-4 h-4 mr-2" />
            Exporter
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-primary/10">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalStudents}</p>
                <p className="text-xs text-muted-foreground">{StudentsLabel} actifs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-green-500/10">
                <UserCheck className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.activeEnrollments}</p>
                <p className="text-xs text-muted-foreground">Inscriptions actives</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-yellow-500/10">
                <Clock className="w-5 h-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.pendingApplications}</p>
                <p className="text-xs text-muted-foreground">Candidatures en attente</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-muted">
                <UserX className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.archivedStudents}</p>
                <p className="text-xs text-muted-foreground">{StudentsLabel} archivés</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Tendance des Inscriptions
            </CardTitle>
            <CardDescription>Nouvelles inscriptions sur les 12 derniers mois</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyTrendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="inscriptions"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Enrollments by Level */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="w-5 h-5" />
              Répartition par Niveau
            </CardTitle>
            <CardDescription>Distribution des {studentsLabel} par niveau d'études</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={levelChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {levelChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Enrollments by Classroom */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Effectifs par Classe
            </CardTitle>
            <CardDescription>Top 10 des classes par nombre de {studentsLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={classroomChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-xs" />
                  <YAxis type="category" dataKey="name" width={100} className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Gender Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Répartition par Genre
            </CardTitle>
            <CardDescription>Distribution des {studentsLabel} par genre</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={genderChartData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {genderChartData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={index === 0 ? "#3b82f6" : index === 1 ? "#ec4899" : "#94a3b8"}
                      />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Application Status */}
      {applicationStatusData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5" />
              État des Candidatures
            </CardTitle>
            <CardDescription>Répartition des candidatures par statut</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {applicationStatusData.map((item) => (
                <div
                  key={item.name}
                  className="p-4 rounded-lg text-center"
                  style={{ backgroundColor: `${item.color}15` }}
                >
                  <p className="text-3xl font-bold" style={{ color: item.color }}>
                    {item.value}
                  </p>
                  <p className="text-sm text-muted-foreground">{item.name}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default EnrollmentStats;
