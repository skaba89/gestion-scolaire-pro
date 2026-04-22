import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { fr } from "date-fns/locale";
import { useStudentLabel } from "@/hooks/useStudentLabel";

interface DepartmentDashboardChartsProps {
  departmentId: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export function DepartmentDashboardCharts({ departmentId }: DepartmentDashboardChartsProps) {
  const { tenant } = useTenant();
  const { StudentsLabel } = useStudentLabel();

  // Get classrooms for this department
  const { data: departmentClassrooms } = useQuery({
    queryKey: ['department-classrooms-ids', departmentId, tenant?.id],
    queryFn: async () => {
      const { data: cdData } = await apiClient.get('/classroom-departments/', {
        params: { department_id: departmentId, tenant_id: tenant?.id || '' },
      });
      return cdData.data || cdData || [];
    },
    enabled: !!departmentId && !!tenant?.id,
  });

  const classroomIds = departmentClassrooms?.map(cd => cd.class_id) || [];

  // Students per classroom
  const { data: studentsPerClassroom } = useQuery({
    queryKey: ['students-per-classroom', classroomIds, tenant?.id],
    queryFn: async () => {
      if (classroomIds.length === 0) return [];
      try {
        const { data: enrollData } = await apiClient.get('/enrollments/', {
          params: { tenant_id: tenant?.id || '', status: 'active', class_ids: classroomIds.join(',') },
        });
        const enrollmentsList = enrollData.data || enrollData || [];

        // Count per classroom
        const counts: Record<string, { name: string; count: number }> = {};
        enrollmentsList.forEach((e: any) => {
          const id = e.class_id;
          const name = e.classrooms?.name || 'Non défini';
          if (!counts[id]) counts[id] = { name, count: 0 };
          counts[id].count++;
        });

        return Object.values(counts);
      } catch {
        return [];
      }
    },
    enabled: classroomIds.length > 0 && !!tenant?.id,
  });

  // Attendance trends (last 7 days)
  const { data: attendanceTrends } = useQuery({
    queryKey: ['attendance-trends', classroomIds, tenant?.id],
    queryFn: async () => {
      if (classroomIds.length === 0) return [];
      try {
        const days = Array.from({ length: 7 }, (_, i) => {
          const date = subDays(new Date(), 6 - i);
          return format(date, 'yyyy-MM-dd');
        });

        const { data: attendData } = await apiClient.get('/attendance/', {
          params: { tenant_id: tenant?.id || '', class_ids: classroomIds.join(','), date_range: days.join(',') },
        });
        const attendList = attendData.data || attendData || [];

        // Group by date
        const grouped: Record<string, { date: string; present: number; absent: number; late: number }> = {};
        days.forEach(d => {
          grouped[d] = { date: format(new Date(d), 'EEE', { locale: fr }), present: 0, absent: 0, late: 0 };
        });

        attendList.forEach((a: any) => {
          if (grouped[a.date]) {
            if (a.status === 'PRESENT') grouped[a.date].present++;
            else if (a.status === 'ABSENT') grouped[a.date].absent++;
            else if (a.status === 'LATE') grouped[a.date].late++;
          }
        });

        return Object.values(grouped);
      } catch {
        return [];
      }
    },
    enabled: classroomIds.length > 0 && !!tenant?.id,
  });

  // Grade distribution
  const { data: gradeDistribution } = useQuery({
    queryKey: ['grade-distribution', classroomIds, tenant?.id],
    queryFn: async () => {
      if (classroomIds.length === 0) return [];
      try {
        const { data: gradesData } = await apiClient.get('/grades/', {
          params: { tenant_id: tenant?.id || '', class_ids: classroomIds.join(',') },
        });
        const gradesList = gradesData.data || gradesData || [];

        // Categorize grades
        const categories = {
          'Excellent (16-20)': 0,
          'Bien (14-16)': 0,
          'Assez bien (12-14)': 0,
          'Passable (10-12)': 0,
          'Insuffisant (<10)': 0,
        };

        gradesList.forEach((g: any) => {
          const score = Number(g.score) || 0;
          const maxScore = Number(g.assessments?.max_score) || 20;
          const normalized = maxScore > 0 ? (score / maxScore) * 20 : 0;

          if (normalized >= 16) categories['Excellent (16-20)']++;
          else if (normalized >= 14) categories['Bien (14-16)']++;
          else if (normalized >= 12) categories['Assez bien (12-14)']++;
          else if (normalized >= 10) categories['Passable (10-12)']++;
          else categories['Insuffisant (<10)']++;
        });

        return Object.entries(categories).map(([name, value]) => ({ name, value }));
      } catch {
        return [];
      }
    },
    enabled: classroomIds.length > 0 && !!tenant?.id,
  });

  // Exams this month
  const { data: examsThisMonth } = useQuery({
    queryKey: ['exams-this-month', departmentId, tenant?.id],
    queryFn: async () => {
      const startDate = format(startOfMonth(new Date()), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(new Date()), 'yyyy-MM-dd');

      const { data: examsData } = await apiClient.get('/department-portal/exams/', {
        params: { tenant_id: tenant?.id || '', department_id: departmentId, date_from: startDate, date_to: endDate },
      }).catch(() => ({ data: [] }));
      const examsList = examsData.data || examsData || [];

      const statusCounts = {
        scheduled: 0,
        completed: 0,
        cancelled: 0,
      };

      examsList.forEach((e: any) => {
        if (e.status === 'scheduled') statusCounts.scheduled++;
        else if (e.status === 'completed') statusCounts.completed++;
        else if (e.status === 'cancelled') statusCounts.cancelled++;
      });

      return [
        { name: 'Programmés', value: statusCounts.scheduled, color: '#3b82f6' },
        { name: 'Terminés', value: statusCounts.completed, color: '#10b981' },
        { name: 'Annulés', value: statusCounts.cancelled, color: '#ef4444' },
      ];
    },
    enabled: !!departmentId && !!tenant?.id,
  });

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Students per Classroom */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{StudentsLabel} par classe</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={studentsPerClassroom || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Attendance Trends */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tendances de présence (7 jours)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={attendanceTrends || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="present" stroke="#10b981" name="Présents" strokeWidth={2} />
                <Line type="monotone" dataKey="absent" stroke="#ef4444" name="Absents" strokeWidth={2} />
                <Line type="monotone" dataKey="late" stroke="#f59e0b" name="Retards" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Grade Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Distribution des notes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={gradeDistribution || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${(name || '').split(' ')[0]} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {(gradeDistribution || []).map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Exams Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Examens ce mois</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={examsThisMonth || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                >
                  {(examsThisMonth || []).map((entry: any, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
