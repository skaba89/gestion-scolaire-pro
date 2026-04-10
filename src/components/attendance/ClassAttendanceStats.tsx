import { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from "recharts";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, subMonths, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2, Users, TrendingUp, Calendar } from "lucide-react";
import { useStudentLabel } from "@/hooks/useStudentLabel";

interface Classroom {
  id: string;
  name: string;
  level?: { name: string } | null;
}

const COLORS = ["#22c55e", "#ef4444", "#f59e0b", "#3b82f6"];
const STATUS_LABELS: Record<string, string> = {
  PRESENT: "Présent",
  ABSENT: "Absent",
  LATE: "Retard",
  EXCUSED: "Excusé",
};

export function ClassAttendanceStats() {
  const { tenant } = useTenant();
  const { studentsLabel } = useStudentLabel();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [overallStats, setOverallStats] = useState<any[]>([]);
  const [trendData, setTrendData] = useState<any[]>([]);

  useEffect(() => {
    if (tenant) {
      fetchClassrooms();
    }
  }, [tenant]);

  useEffect(() => {
    if (selectedClassroom) {
      fetchAttendanceStats();
    }
  }, [selectedClassroom]);

  const fetchClassrooms = async () => {
    if (!tenant) return;

    const { data } = await apiClient.get<Classroom[]>("/classrooms/", {
      params: {
        tenant_id: tenant.id,
        ordering: "name",
      },
    });

    setClassrooms(data || []);
  };

  const fetchAttendanceStats = async () => {
    if (!tenant || !selectedClassroom) return;

    setLoading(true);

    try {
      // Get students in classroom
      const { data: academicYear } = await apiClient.get<{ id: string }>("/academic-years/", {
        params: { tenant_id: tenant.id, is_current: true },
      }).catch(() => ({ data: null as any }));

      const ayId = Array.isArray(academicYear) ? academicYear[0]?.id : academicYear?.id;

      if (!ayId) {
        setLoading(false);
        return;
      }

      const { data: enrollments } = await apiClient.get<{ student_id: string }[]>("/enrollments/", {
        params: {
          class_id: selectedClassroom,
          academic_year_id: ayId,
          status: "active",
        },
      });

      const studentIds = (enrollments || []).map((e) => e.student_id);

      if (studentIds.length === 0) {
        setWeeklyData([]);
        setMonthlyData([]);
        setOverallStats([]);
        setTrendData([]);
        setLoading(false);
        return;
      }

      // Get current week attendance
      const now = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

      const { data: weekAttendance } = await apiClient.get<any[]>("/attendance/", {
        params: {
          student_id__in: studentIds.join(","),
          date_gte: format(weekStart, "yyyy-MM-dd"),
          date_lte: format(weekEnd, "yyyy-MM-dd"),
        },
      });

      // Process weekly data
      const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
      const weekly = weekDays.map((day) => {
        const dayStr = format(day, "yyyy-MM-dd");
        const dayAttendance = (weekAttendance || []).filter(
          (a) => a.date === dayStr
        );

        return {
          day: format(day, "EEE", { locale: fr }),
          date: format(day, "dd/MM"),
          Présent: dayAttendance.filter((a) => a.status === "PRESENT").length,
          Absent: dayAttendance.filter((a) => a.status === "ABSENT").length,
          Retard: dayAttendance.filter((a) => a.status === "LATE").length,
          Excusé: dayAttendance.filter((a) => a.status === "EXCUSED").length,
        };
      });
      setWeeklyData(weekly);

      // Get current month attendance
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);

      const { data: monthAttendance } = await apiClient.get<any[]>("/attendance/", {
        params: {
          student_id__in: studentIds.join(","),
          date_gte: format(monthStart, "yyyy-MM-dd"),
          date_lte: format(monthEnd, "yyyy-MM-dd"),
        },
      });

      // Process overall stats for pie chart
      const overall = [
        { name: "Présent", value: (monthAttendance || []).filter((a) => a.status === "PRESENT").length, color: COLORS[0] },
        { name: "Absent", value: (monthAttendance || []).filter((a) => a.status === "ABSENT").length, color: COLORS[1] },
        { name: "Retard", value: (monthAttendance || []).filter((a) => a.status === "LATE").length, color: COLORS[2] },
        { name: "Excusé", value: (monthAttendance || []).filter((a) => a.status === "EXCUSED").length, color: COLORS[3] },
      ];
      setOverallStats(overall);

      // Get last 3 months trend
      const threeMonthsAgo = subMonths(now, 3);

      const { data: trendAttendance } = await apiClient.get<any[]>("/attendance/", {
        params: {
          student_id__in: studentIds.join(","),
          date_gte: format(threeMonthsAgo, "yyyy-MM-dd"),
          date_lte: format(now, "yyyy-MM-dd"),
        },
      });

      // Process monthly trend
      const months = [subMonths(now, 2), subMonths(now, 1), now];
      const trend = months.map((month) => {
        const monthData = (trendAttendance || []).filter((a) => {
          const attendanceDate = parseISO(a.date);
          return (
            attendanceDate >= startOfMonth(month) &&
            attendanceDate <= endOfMonth(month)
          );
        });

        const total = monthData.length || 1;
        const presentCount = monthData.filter((a) => a.status === "PRESENT").length;
        const attendanceRate = Math.round((presentCount / total) * 100);

        return {
          month: format(month, "MMMM", { locale: fr }),
          "Taux de présence": attendanceRate,
          total: monthData.length,
        };
      });
      setTrendData(trend);

      // Process monthly data by week
      const weeksInMonth = Math.ceil(
        (monthEnd.getDate() - monthStart.getDate() + 1) / 7
      );
      const monthlyByWeek = [];
      for (let i = 0; i < weeksInMonth; i++) {
        const weekData = (monthAttendance || []).filter((a) => {
          const day = parseISO(a.date).getDate();
          return day >= i * 7 + 1 && day < (i + 1) * 7 + 1;
        });

        monthlyByWeek.push({
          week: `Sem ${i + 1}`,
          Présent: weekData.filter((a) => a.status === "PRESENT").length,
          Absent: weekData.filter((a) => a.status === "ABSENT").length,
          Retard: weekData.filter((a) => a.status === "LATE").length,
        });
      }
      setMonthlyData(monthlyByWeek);
    } catch (error) {
      console.error("Error fetching attendance stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalRecords = overallStats.reduce((acc, s) => acc + s.value, 0);
  const presentRate =
    totalRecords > 0
      ? Math.round(
        (((overallStats.find((s) => s.name === "Présent")?.value) || 0) /
          totalRecords) *
        100
      )
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Statistiques de Pointage par Classe</h2>
          <p className="text-muted-foreground">
            Analysez l'assiduité des {studentsLabel} par classe
          </p>
        </div>
        <div className="w-full sm:w-64">
          <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner une classe" />
            </SelectTrigger>
            <SelectContent>
              {classrooms.map((classroom) => (
                <SelectItem key={classroom.id} value={classroom.id}>
                  {classroom.name}
                  {classroom.level && ` - ${classroom.level.name}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!selectedClassroom ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground">
              Sélectionnez une classe pour voir les statistiques
            </p>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Taux de présence</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{presentRate}%</div>
                <p className="text-xs text-muted-foreground">Ce mois-ci</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total pointages</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalRecords}</div>
                <p className="text-xs text-muted-foreground">Ce mois-ci</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Absences</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {overallStats.find((s) => s.name === "Absent")?.value || 0}
                </div>
                <p className="text-xs text-muted-foreground">Ce mois-ci</p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="weekly" className="space-y-4">
            <TabsList>
              <TabsTrigger value="weekly">Cette semaine</TabsTrigger>
              <TabsTrigger value="monthly">Ce mois</TabsTrigger>
              <TabsTrigger value="trend">Tendance</TabsTrigger>
            </TabsList>

            <TabsContent value="weekly">
              <Card>
                <CardHeader>
                  <CardTitle>Assiduité hebdomadaire</CardTitle>
                </CardHeader>
                <CardContent>
                  {weeklyData.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">
                      Aucune donnée disponible pour cette semaine
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={weeklyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="day" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="Présent" fill={COLORS[0]} />
                        <Bar dataKey="Absent" fill={COLORS[1]} />
                        <Bar dataKey="Retard" fill={COLORS[2]} />
                        <Bar dataKey="Excusé" fill={COLORS[3]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="monthly">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Répartition mensuelle</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {overallStats.every((s) => s.value === 0) ? (
                      <p className="text-center py-8 text-muted-foreground">
                        Aucune donnée disponible pour ce mois
                      </p>
                    ) : (
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie
                            data={overallStats}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey="value"
                            label={({ name, percent }) =>
                              `${name} ${(percent * 100).toFixed(0)}%`
                            }
                          >
                            {overallStats.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={entry.color}
                              />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Par semaine</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {monthlyData.length === 0 ? (
                      <p className="text-center py-8 text-muted-foreground">
                        Aucune donnée disponible
                      </p>
                    ) : (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={monthlyData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="week" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="Présent" fill={COLORS[0]} />
                          <Bar dataKey="Absent" fill={COLORS[1]} />
                          <Bar dataKey="Retard" fill={COLORS[2]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="trend">
              <Card>
                <CardHeader>
                  <CardTitle>Évolution du taux de présence (3 derniers mois)</CardTitle>
                </CardHeader>
                <CardContent>
                  {trendData.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">
                      Aucune donnée disponible
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis domain={[0, 100]} />
                        <Tooltip formatter={(value) => `${value}%`} />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="Taux de présence"
                          stroke={COLORS[0]}
                          strokeWidth={3}
                          dot={{ fill: COLORS[0], strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
