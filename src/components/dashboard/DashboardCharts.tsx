import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
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
  Legend,
  LineChart,
  Line
} from "recharts";
import { Users, TrendingUp, UserCheck } from "lucide-react";
import { useStudentLabel } from "@/hooks/useStudentLabel";

import { dashboardQueries } from "@/queries/dashboard";

export const COLORS = ['hsl(217, 91%, 40%)', 'hsl(199, 89%, 48%)', 'hsl(142, 76%, 36%)', 'hsl(38, 92%, 50%)', 'hsl(16, 85%, 57%)', 'hsl(168, 76%, 42%)'];

export const DashboardCharts = () => {
  const { tenant } = useTenant();
  const { StudentsLabel, studentsLabel } = useStudentLabel();

  // Unified fetch for all dashboard charts
  const { data, isLoading } = useQuery({
    ...dashboardQueries.chartData(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const studentsByLevel = data?.studentsByLevel || [];
  const attendanceStats = data?.attendanceStats || [];
  const classAverages = data?.classAverages || [];


  const presentRate = attendanceStats?.find(a => a.name === "Présents")?.percentage || 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {studentsByLevel?.reduce((a, b) => a + b.count, 0) || 0}
                </p>
                <p className="text-xs text-muted-foreground">{StudentsLabel} inscrits</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{presentRate}%</p>
                <p className="text-xs text-muted-foreground">Taux de présence (30j)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-info" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {classAverages?.length ? (classAverages.reduce((a, b) => a + b.moyenne, 0) / classAverages.length).toFixed(1) : "—"}
                </p>
                <p className="text-xs text-muted-foreground">Moyenne générale</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Students by Level */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Effectifs par Niveau ({studentsLabel})</CardTitle>
          </CardHeader>
          <CardContent>
            {studentsByLevel && studentsByLevel.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={studentsByLevel} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="hsl(217, 91%, 40%)"
                    radius={[4, 4, 0, 0]}
                    name={StudentsLabel}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                Aucune donnée d'inscription disponible
              </div>
            )}
          </CardContent>
        </Card>

        {/* Attendance Rate */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Répartition des Présences (30 derniers jours)</CardTitle>
          </CardHeader>
          <CardContent>
            {attendanceStats && attendanceStats.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={attendanceStats}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {attendanceStats.map((entry, index) => (
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
                    formatter={(value: number, name: string) => [`${value} (${attendanceStats.find(a => a.name === name)?.percentage}%)`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                Aucune donnée de présence disponible
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Class Averages */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Moyennes par Classe</CardTitle>
        </CardHeader>
        <CardContent>
          {classAverages && classAverages.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
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
                <Bar
                  dataKey="moyenne"
                  fill="hsl(142, 76%, 36%)"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
              Aucune note disponible
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
