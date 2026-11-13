import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { parseDepartmentClassrooms } from "@/utils/departmentClassrooms";
import { useClassrooms } from "@/queries/classrooms";
import { buildDepartmentEnrollmentCounts, parseDepartmentEnrollmentResponse } from "@/utils/departmentEnrollmentCounts";
import { buildDepartmentAttendanceTrends } from "@/utils/departmentAttendanceTrends";
import { buildDepartmentGradeDistribution } from "@/utils/departmentGradeDistribution";
import { buildDepartmentExamStatusCounts } from "@/utils/departmentExamStatusCounts";
import { dateFnsLocale } from "@/lib/locale";
import { useTranslation } from "react-i18next";

interface DepartmentDashboardChartsProps {
  departmentId: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export function DepartmentDashboardCharts({ departmentId }: DepartmentDashboardChartsProps) {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const { StudentsLabel } = useStudentLabel();
  const { data: tenantClassrooms = [], isError: tenantClassroomsError } = useClassrooms(tenant?.id || "");

  // Get classrooms for this department
  const { data: departmentClassrooms, isError: departmentClassroomsError } = useQuery({
    queryKey: ['department-classrooms-ids', departmentId, tenant?.id],
    queryFn: async () => {
      // The infrastructure endpoint returns all departments of the authenticated tenant.
      // Filter by department here; it does not accept department_id as a filter.
      const { data: cdData } = await apiClient.get('/infrastructure/classroom-departments/');
      return parseDepartmentClassrooms(cdData, departmentId);
    },
    enabled: !!departmentId && !!tenant?.id,
  });

  const classroomIds = departmentClassrooms?.map(cd => cd.class_id) || [];

  // Students per classroom
  const { data: studentsPerClassroom, isError: studentsPerClassroomError } = useQuery({
    queryKey: ['students-per-classroom', classroomIds, tenant?.id, tenantClassrooms],
    queryFn: async () => {
      if (classroomIds.length === 0) return [];
      const { data: enrollData } = await apiClient.get('/enrollments/', {
        params: { status: 'active', class_ids: classroomIds.join(',') },
      });
      const enrollmentsList = parseDepartmentEnrollmentResponse(enrollData);

      // Enrollment responses have student info but no classroom name.
      // Resolve labels from the canonical tenant-scoped classrooms query.
      return buildDepartmentEnrollmentCounts(enrollmentsList, classroomIds, tenantClassrooms);
    },
    enabled: classroomIds.length > 0 && !!tenant?.id,
  });

  // Attendance trend API supports a single classroom_id, date_from/date_to,
  // and paginated {items}; it does not support class_ids or date_range.
  const { data: attendanceTrends, isError: attendanceTrendsError } = useQuery({
    queryKey: ['attendance-trends', classroomIds, tenant?.id],
    queryFn: async () => {
      if (classroomIds.length === 0) return [];
      const now = new Date();
      const dayDates = Array.from({ length: 7 }, (_, i) => subDays(now, 6 - i));
      const days = dayDates.map(day => ({
        date: format(day, 'yyyy-MM-dd'),
        label: format(day, 'EEE', { locale: dateFnsLocale() }),
      }));
      const attendance = [];
      // Scope every request at the API using classroom_id and tenant auth.
      // Paginate instead of silently truncating to the default 100 records.
      for (const classroomId of new Set(classroomIds)) {
        let offset = 0;
        const limit = 500;
        for (let page = 0; page < 100; page++) {
          const { data } = await apiClient.get('/attendance/', {
            params: {
              classroom_id: classroomId,
              date_from: days[0].date,
              date_to: days[days.length - 1].date,
              limit,
              offset,
            },
          });
          if (!data || !Array.isArray(data.items)) {
            throw new Error('Réponse des présences non conforme');
          }
          attendance.push(...data.items);
          if (data.items.length < limit) break;
          if (page === 99) throw new Error('Trop de présences pour le graphique');
          offset += limit;
        }
      }
      return buildDepartmentAttendanceTrends(attendance, days, classroomIds);
    },
    enabled: classroomIds.length > 0 && !!tenant?.id,
  });

  // The grade API accepts one class_id and returns paginated {items, pages}.
  // Fetch the whole series; do not silently report zero on API failures.
  const { data: gradeDistribution, isError: gradeDistributionError } = useQuery({
    queryKey: ['grade-distribution', classroomIds, tenant?.id],
    queryFn: async () => {
      if (classroomIds.length === 0) return [];
      const grades: Array<{ score: number; max_score: number; id: string }> = [];
      const seen = new Set<string>();
      for (const classroomId of new Set(classroomIds)) {
        for (let page = 1; page <= 100; page++) {
          const { data } = await apiClient.get('/grades/', {
            params: { class_id: classroomId, page, page_size: 100 },
          });
          if (!data || !Array.isArray(data.items) || !Number.isInteger(data.pages)) {
            throw new Error('Réponse des notes non conforme');
          }
          for (const grade of data.items) {
            if (grade && typeof grade.id === 'string' && !seen.has(grade.id)) {
              seen.add(grade.id);
              grades.push(grade);
            }
          }
          if (page >= data.pages) break;
          if (page === 100) throw new Error('Trop de notes pour le graphique');
        }
      }
      return buildDepartmentGradeDistribution(grades);
    },
    enabled: classroomIds.length > 0 && !!tenant?.id,
  });

  // Exams this month
  const { data: examsThisMonth, isError: examsThisMonthError } = useQuery({
    queryKey: ['exams-this-month', departmentId, tenant?.id],
    queryFn: async () => {
      const startDate = format(startOfMonth(new Date()), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(new Date()), 'yyyy-MM-dd');

      // Backend authenticates the tenant and current user's department.
      // This endpoint returns {exams, classrooms, subjects, terms}, and
      // does not implement date_from/date_to query filters.
      const { data: examsData } = await apiClient.get('/department-portal/exams/');
      return buildDepartmentExamStatusCounts(examsData, startDate, endDate, departmentId);
    },
    enabled: !!departmentId && !!tenant?.id,
  });

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Students per Classroom */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("departmentPortal.charts.perClass", { label: StudentsLabel })}</CardTitle>
          {(departmentClassroomsError || tenantClassroomsError) && <p role="alert" className="text-sm text-destructive">{t("departmentPortal.charts.classroomsError")}</p>}
          {studentsPerClassroomError && <p role="alert" className="text-sm text-destructive">{t("departmentPortal.charts.headcountError")}</p>}
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
          <CardTitle className="text-sm">{t("departmentPortal.charts.attendanceTrends")}</CardTitle>
          {attendanceTrendsError && <p role="alert" className="text-sm text-destructive">{t("departmentPortal.charts.attendanceError")}</p>}
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
                <Line type="monotone" dataKey="present" stroke="#10b981" name={t("departmentPortal.charts.present")} strokeWidth={2} />
                <Line type="monotone" dataKey="absent" stroke="#ef4444" name={t("departmentPortal.charts.absent")} strokeWidth={2} />
                <Line type="monotone" dataKey="late" stroke="#f59e0b" name="Retards" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Grade Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("departmentPortal.charts.gradeDistribution")}</CardTitle>
          {gradeDistributionError && <p role="alert" className="text-sm text-destructive">{t("departmentPortal.charts.gradesError")}</p>}
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
          <CardTitle className="text-sm">{t("departmentPortal.charts.examsThisMonth")}</CardTitle>
          {examsThisMonthError && <p role="alert" className="text-sm text-destructive">{t("departmentPortal.charts.examsError")}</p>}
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
