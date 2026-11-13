import { useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, subDays, startOfWeek, endOfWeek, subMonths } from "date-fns";
import { Download, FileText, AlertTriangle, Filter, Bell, FileSpreadsheet, Mail, Loader2 } from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitize";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { dateFnsLocale } from "@/lib/locale";
import i18n from "i18next";
import { useTranslation } from "react-i18next";

const ATTENDANCE_THRESHOLD = 80;

// CSV Export utility
const exportToCSV = (data: any[], filename: string) => {
  if (!data || data.length === 0) {
    toast.error(i18n.t("departmentPortal.reports.noData"));
    return;
  }

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(';'),
    ...data.map(row => headers.map(header => {
      const value = row[header];
      if (typeof value === 'string' && (value.includes(';') || value.includes(','))) {
        return `"${value}"`;
      }
      return value ?? '';
    }).join(';'))
  ].join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  toast.success(i18n.t("departmentPortal.reports.csvDone"));
};

export default function DepartmentReports() {
  const { t } = useTranslation();
  /** En-têtes et libellés des exports CSV, dans la langue de l'interface. */
  const c = (key: string) => t(`departmentPortal.reports.csv.${key}`);
  const { tenant } = useTenant();
  const { user } = useAuth();
  const reportRef = useRef<HTMLDivElement>(null);

  // Filters
  const [selectedPeriod, setSelectedPeriod] = useState<string>("30days");
  const [selectedClassroom, setSelectedClassroom] = useState<string>("all");
  const [lowAttendanceAlerts, setLowAttendanceAlerts] = useState<any[]>([]);

  // Get department for current user
  const { data: userDepartment } = useQuery({
    queryKey: ['user-department', user?.id, tenant?.id],
    queryFn: async () => {
      const { data } = await apiClient.get('/department-portal/members/', {
        params: { user_id: user?.id, tenant_id: tenant?.id },
      });
      return Array.isArray(data) ? data[0] ?? null : data;
    },
    enabled: !!user?.id && !!tenant?.id,
  });

  // Get classrooms for this department
  const { data: departmentClassrooms } = useQuery({
    queryKey: ['department-classrooms-report', userDepartment?.department_id, tenant?.id],
    queryFn: async () => {
      const { data } = await apiClient.get('/department-portal/classrooms/', {
        params: { department_id: userDepartment?.department_id, tenant_id: tenant?.id },
      });
      return Array.isArray(data) ? data : [];
    },
    enabled: !!userDepartment?.department_id && !!tenant?.id,
  });

  // Get period dates
  const getPeriodDates = () => {
    const now = new Date();
    switch (selectedPeriod) {
      case "week":
        return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
      case "month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "3months":
        return { start: subMonths(now, 3), end: now };
      case "30days":
      default:
        return { start: subDays(now, 30), end: now };
    }
  };

  const classroomIds = selectedClassroom === "all"
    ? (departmentClassrooms?.map(cd => cd.class_id) || [])
    : [selectedClassroom];

  // Get statistics with filters
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['department-report-stats', classroomIds, tenant?.id, selectedPeriod, selectedClassroom],
    queryFn: async () => {
      if (classroomIds.length === 0) return null;

      const { start, end } = getPeriodDates();
      const startDate = format(start, 'yyyy-MM-dd');
      const endDate = format(end, 'yyyy-MM-dd');

      const params: Record<string, any> = {
        tenant_id: tenant?.id,
        class_ids: classroomIds.join(','),
        start_date: startDate,
        end_date: endDate,
      };

      const { data } = await apiClient.get('/department-portal/reports/stats/', { params });
      return data;
    },
    enabled: classroomIds.length > 0 && !!tenant?.id && !!userDepartment?.department_id,
  });

  const getPeriodLabel = () => {
    switch (selectedPeriod) {
      case "week": return t("departmentPortal.reports.period.week");
      case "month": return t("departmentPortal.reports.period.month");
      case "3months": return t("departmentPortal.reports.period.3months");
      case "30days":
      default: return t("departmentPortal.reports.period.30days");
    }
  };

  // Check for low attendance alerts
  useEffect(() => {
    if (stats?.attendancePerClass && departmentClassrooms) {
      const alerts: any[] = [];

      Object.entries(stats.attendancePerClass).forEach(([classId, data]: [string, any]) => {
        if (data.total > 0) {
          const rate = ((data.present + data.late) / data.total) * 100;
          if (rate < ATTENDANCE_THRESHOLD) {
            const classroom = departmentClassrooms.find(cd => cd.class_id === classId);
            alerts.push({
              classroomId: classId,
              classroomName: (classroom?.classrooms as any)?.name || t("departmentPortal.reports.unknownClass"),
              rate: rate.toFixed(1),
              total: data.total,
              absent: data.total - data.present - data.late,
            });
          }
        }
      });

      setLowAttendanceAlerts(alerts);

      if (alerts.length > 0) {
        toast.warning(t("departmentPortal.reports.lowAttendanceDetected", { count: alerts.length }), {
          icon: <Bell className="h-4 w-4" />,
        });
      }
    }
  }, [stats?.attendancePerClass, departmentClassrooms, t]);

  const [isSendingAlert, setIsSendingAlert] = useState(false);

  // Send email alert to department head
  const sendEmailAlert = async () => {
    if (lowAttendanceAlerts.length === 0) {
      toast.info(t("departmentPortal.reports.noAlert"));
      return;
    }

    setIsSendingAlert(true);
    try {
      await apiClient.post('/department-portal/alerts/send/', {
        departmentId: userDepartment?.department_id,
        departmentName: (userDepartment?.departments as any)?.name,
        tenantId: tenant?.id,
        tenantName: tenant?.name,
        alerts: lowAttendanceAlerts.map(a => ({
          classroomName: a.classroomName,
          rate: a.rate,
          absent: a.absent,
          total: a.total,
        })),
        periodLabel: getPeriodLabel(),
      });

      // Save to history
      await apiClient.post('/department-portal/alerts/', {
        tenant_id: tenant?.id,
        department_id: userDepartment?.department_id,
        sent_by: user?.id,
        alert_type: 'manual',
        period_label: getPeriodLabel(),
        alerts_data: lowAttendanceAlerts,
        email_sent: true,
      });

      toast.success(t("departmentPortal.reports.alertSent"));
    } catch (error: any) {
      toast.error(t("departmentPortal.reports.alertError"));
    } finally {
      setIsSendingAlert(false);
    }
  };

  // Export functions
  const exportAttendanceCSV = () => {
    if (!stats) return;

    const data = [
      {
        [c("category")]: t("departmentPortal.reports.present"),
        [c("count")]: stats.attendance.present,
        [c("percentage")]: `${((stats.attendance.present / (stats.attendance.total || 1)) * 100).toFixed(1)}%`
      },
      {
        [c("category")]: t("departmentPortal.reports.absent"),
        [c("count")]: stats.attendance.absent,
        [c("percentage")]: `${((stats.attendance.absent / (stats.attendance.total || 1)) * 100).toFixed(1)}%`
      },
      {
        [c("category")]: t("departmentPortal.reports.late"),
        [c("count")]: stats.attendance.late,
        [c("percentage")]: `${((stats.attendance.late / (stats.attendance.total || 1)) * 100).toFixed(1)}%`
      },
      {
        [c("category")]: t("departmentPortal.reports.total"),
        [c("count")]: stats.attendance.total,
        [c("percentage")]: "100%"
      }
    ];

    exportToCSV(data, `presence_${(userDepartment?.departments as any)?.code || 'dept'}`);
  };

  const exportStudentsCSV = () => {
    if (!stats?.studentsPerClass) return;

    const data = stats.studentsPerClass.map((cls: any) => ({
      [t("departmentPortal.reports.class")]: cls.name,
      [t("departmentPortal.reports.studentCount")]: cls.count,
    }));

    exportToCSV(data, `etudiants_par_classe_${(userDepartment?.departments as any)?.code || 'dept'}`);
  };

  const exportTeachersCSV = () => {
    if (!stats?.teachers) return;

    const data = stats.teachers.map((teacher: any) => ({
      [c("firstName")]: teacher.first_name || '',
      [c("lastName")]: teacher.last_name || '',
    }));

    exportToCSV(data, `enseignants_${(userDepartment?.departments as any)?.code || 'dept'}`);
  };

  const exportExamsCSV = () => {
    if (!stats?.exams) return;

    const data = stats.exams.map((e: any) => ({
      [t("departmentPortal.reports.exam")]: e.name,
      [t("departmentPortal.reports.subject")]: e.subjects?.name || '',
      [t("departmentPortal.reports.date")]: format(new Date(e.exam_date), 'dd/MM/yyyy'),
      [t("departmentPortal.reports.status")]: e.status,
    }));

    exportToCSV(data, `examens_${(userDepartment?.departments as any)?.code || 'dept'}`);
  };

  const exportFullReportCSV = () => {
    if (!stats) return;

    const data = [
      { [c("section")]: t("departmentPortal.reports.overview"), [c("indicator")]: t("departmentPortal.reports.students"), [c("value")]: stats.studentCount },
      { [c("section")]: t("departmentPortal.reports.overview"), [c("indicator")]: t("departmentPortal.reports.teachers"), [c("value")]: stats.teacherCount },
      { [c("section")]: t("departmentPortal.reports.overview"), [c("indicator")]: t("departmentPortal.reports.attendanceRate"), [c("value")]: `${stats.attendance.rate.toFixed(1)}%` },
      { [c("section")]: t("departmentPortal.reports.overview"), [c("indicator")]: t("departmentPortal.reports.average"), [c("value")]: `${stats.averageGrade.toFixed(2)}/20` },
      { [c("section")]: t("departmentPortal.reports.attendance"), [c("indicator")]: t("departmentPortal.reports.present"), [c("value")]: stats.attendance.present },
      { [c("section")]: t("departmentPortal.reports.attendance"), [c("indicator")]: t("departmentPortal.reports.absent"), [c("value")]: stats.attendance.absent },
      { [c("section")]: t("departmentPortal.reports.attendance"), [c("indicator")]: t("departmentPortal.reports.late"), [c("value")]: stats.attendance.late },
      ...stats.studentsPerClass.map((cls: any) => ({
        [c("section")]: t("departmentPortal.reports.studentsPerClass"),
        [c("indicator")]: cls.name,
        [c("value")]: cls.count,
      })),
      ...stats.exams.map((e: any) => ({
        [c("section")]: t("departmentPortal.reports.exams"),
        [c("indicator")]: e.name,
        [c("value")]: format(new Date(e.exam_date), 'dd/MM/yyyy'),
      })),
    ];

    exportToCSV(data, `rapport_complet_${(userDepartment?.departments as any)?.code || 'dept'}`);
  };

  const generatePDF = () => {
    if (!reportRef.current) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error(t("departmentPortal.reports.printBlocked"));
      return;
    }

    // SECURITY: Sanitize innerHTML before injecting into new document
    const content = sanitizeHtml(reportRef.current.innerHTML);
    const departmentName = (userDepartment?.departments as any)?.name || t("departmentPortal.reports.department");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${t("departmentPortal.reports.reportTitle", { name: departmentName })}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #1a1a2e; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #3b82f6; padding-bottom: 20px; }
          .header h1 { font-size: 24px; color: #1a1a2e; margin-bottom: 5px; }
          .header p { color: #64748b; font-size: 14px; }
          .section { margin-bottom: 25px; }
          .section-title { font-size: 16px; font-weight: 600; color: #3b82f6; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; }
          .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px; }
          .stat-card { background: #f8fafc; padding: 15px; border-radius: 8px; text-align: center; }
          .stat-value { font-size: 24px; font-weight: 700; color: #1a1a2e; }
          .stat-label { font-size: 12px; color: #64748b; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
          th { background: #f1f5f9; font-weight: 600; }
          .footer { margin-top: 40px; text-align: center; color: #94a3b8; font-size: 11px; }
          .alert-box { background: #fef3c7; border: 1px solid #f59e0b; padding: 12px; border-radius: 8px; margin-bottom: 15px; }
          .alert-title { font-weight: 600; color: #92400e; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        ${content}
        <div class="footer">
          <p>${t("departmentPortal.reports.generatedOn", { date: format(new Date(), "PPp", { locale: dateFnsLocale() }) })}</p>
          <p>${tenant?.name || ''}</p>
        </div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `);

    printWindow.document.close();
    toast.success(t("departmentPortal.reports.pdfDone"));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t("departmentPortal.reports.title")}</h1>
          <p className="text-muted-foreground">
            {t("departmentPortal.departmentName", { name: (userDepartment?.departments as any)?.name || t("departmentPortal.notAssigned") })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportFullReportCSV}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            {t("departmentPortal.reports.exportCsv")}
          </Button>
          <Button onClick={generatePDF}>
            <Download className="h-4 w-4 mr-2" />
            {t("departmentPortal.reports.exportPdf")}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-5 w-5" />
            {t("departmentPortal.reports.filters")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("departmentPortal.reports.periodLabel")}</label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger>
                  <SelectValue placeholder={t("departmentPortal.reports.selectPeriod")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">{t("departmentPortal.reports.period.week")}</SelectItem>
                  <SelectItem value="month">{t("departmentPortal.reports.period.month")}</SelectItem>
                  <SelectItem value="30days">{t("departmentPortal.reports.period.30days")}</SelectItem>
                  <SelectItem value="3months">{t("departmentPortal.reports.period.3months")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("departmentPortal.reports.class")}</label>
              <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
                <SelectTrigger>
                  <SelectValue placeholder={t("departmentPortal.reports.selectClass")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("departmentPortal.allClasses")}</SelectItem>
                  {departmentClassrooms?.filter(cd => cd.class_id).map((cd) => (
                    <SelectItem key={cd.class_id} value={cd.class_id}>
                      {(cd.classrooms as any)?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Low Attendance Alerts */}
      {lowAttendanceAlerts.length > 0 && (
        <Alert variant="destructive" className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="text-yellow-800 dark:text-yellow-200 flex items-center justify-between">
            <span>{t("departmentPortal.reports.lowAttendance")}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={sendEmailAlert}
              disabled={isSendingAlert}
              className="bg-white hover:bg-yellow-100 text-yellow-800 border-yellow-300"
            >
              {isSendingAlert ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              {t("departmentPortal.reports.sendAlert")}
            </Button>
          </AlertTitle>
          <AlertDescription className="text-yellow-700 dark:text-yellow-300">
            <p className="mb-3">
              {t("departmentPortal.reports.lowAttendanceIntro", { threshold: ATTENDANCE_THRESHOLD })}
            </p>
            <div className="space-y-2">
              {lowAttendanceAlerts.map((alert) => (
                <div
                  key={alert.classroomId}
                  className="flex items-center justify-between bg-white dark:bg-yellow-900 p-3 rounded-lg border border-yellow-200 dark:border-yellow-700"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">
                      {alert.rate}%
                    </Badge>
                    <span className="font-medium">{alert.classroomName}</span>
                  </div>
                  <span className="text-sm">
                    {t("departmentPortal.reports.absencesOf", { absent: alert.absent, total: alert.total })}
                  </span>
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Export Options */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="h-5 w-5" />
            {t("departmentPortal.reports.csvExports")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={exportAttendanceCSV}>
              {t("departmentPortal.reports.attendance")}
            </Button>
            <Button variant="outline" size="sm" onClick={exportStudentsCSV}>
              {t("departmentPortal.reports.studentsPerClass")}
            </Button>
            <Button variant="outline" size="sm" onClick={exportTeachersCSV}>
              {t("departmentPortal.reports.teachers")}
            </Button>
            <Button variant="outline" size="sm" onClick={exportExamsCSV}>
              {t("departmentPortal.reports.exams")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t("departmentPortal.reports.preview")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div ref={reportRef} className="bg-white p-6 rounded-lg">
            {/* Header */}
            <div className="header text-center mb-6 pb-4 border-b-2 border-primary">
              <h1 className="text-2xl font-bold">
                {t("departmentPortal.reports.reportOf", { name: (userDepartment?.departments as any)?.name ?? "" })}
              </h1>
              <p className="text-muted-foreground text-sm">
                {t("departmentPortal.reports.academicYear", { year: stats?.academicYear ?? "" })}
                {t("departmentPortal.reports.periodValue", { period: stats?.periodLabel || getPeriodLabel() })}
                {selectedClassroom !== "all" && t("departmentPortal.reports.classValue", { name: departmentClassrooms?.find(cd => cd.class_id === selectedClassroom)?.classrooms?.name ?? "" })}
              </p>
            </div>

            {/* Stats Grid */}
            <div className="section mb-6">
              <div className="section-title text-primary font-semibold mb-3 border-b pb-2">
                {t("departmentPortal.reports.overview")}
              </div>
              <div className="stats-grid grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="stat-card bg-muted/50 p-4 rounded-lg text-center">
                  <div className="stat-value text-2xl font-bold">{stats?.studentCount || 0}</div>
                  <div className="stat-label text-sm text-muted-foreground">{t("departmentPortal.reports.students")}</div>
                </div>
                <div className="stat-card bg-muted/50 p-4 rounded-lg text-center">
                  <div className="stat-value text-2xl font-bold">{stats?.teacherCount || 0}</div>
                  <div className="stat-label text-sm text-muted-foreground">{t("departmentPortal.reports.teachers")}</div>
                </div>
                <div className="stat-card bg-muted/50 p-4 rounded-lg text-center">
                  <div className={`stat-value text-2xl font-bold ${(stats?.attendance?.rate || 0) < ATTENDANCE_THRESHOLD ? 'text-red-500' : ''}`}>
                    {stats?.attendance?.rate?.toFixed(1) || 0}%
                  </div>
                  <div className="stat-label text-sm text-muted-foreground">{t("departmentPortal.reports.attendanceRate")}</div>
                </div>
                <div className="stat-card bg-muted/50 p-4 rounded-lg text-center">
                  <div className="stat-value text-2xl font-bold">{stats?.averageGrade?.toFixed(2) || 0}/20</div>
                  <div className="stat-label text-sm text-muted-foreground">{t("departmentPortal.reports.average")}</div>
                </div>
              </div>
            </div>

            {/* Classes */}
            <div className="section mb-6">
              <div className="section-title text-primary font-semibold mb-3 border-b pb-2">
                {t("departmentPortal.reports.byClass")}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="p-2 text-left">{t("departmentPortal.reports.class")}</th>
                    <th className="p-2 text-right">{t("departmentPortal.reports.studentCount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats?.studentsPerClass?.map((cls: any, idx: number) => (
                    <tr key={idx} className="border-b">
                      <td className="p-2">{cls.name}</td>
                      <td className="p-2 text-right">{cls.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Attendance Details */}
            <div className="section mb-6">
              <div className="section-title text-primary font-semibold mb-3 border-b pb-2">
                {t("departmentPortal.reports.attendanceStats", { period: stats?.periodLabel || getPeriodLabel() })}
              </div>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div className="p-3 bg-green-50 rounded text-center">
                  <div className="font-bold text-green-700">{stats?.attendance?.present || 0}</div>
                  <div className="text-green-600">{t("departmentPortal.reports.present")}</div>
                </div>
                <div className="p-3 bg-red-50 rounded text-center">
                  <div className="font-bold text-red-700">{stats?.attendance?.absent || 0}</div>
                  <div className="text-red-600">{t("departmentPortal.reports.absent")}</div>
                </div>
                <div className="p-3 bg-yellow-50 rounded text-center">
                  <div className="font-bold text-yellow-700">{stats?.attendance?.late || 0}</div>
                  <div className="text-yellow-600">{t("departmentPortal.reports.late")}</div>
                </div>
                <div className="p-3 bg-blue-50 rounded text-center">
                  <div className="font-bold text-blue-700">{stats?.attendance?.total || 0}</div>
                  <div className="text-blue-600">{t("departmentPortal.reports.total")}</div>
                </div>
              </div>
            </div>

            {/* Teachers */}
            <div className="section mb-6">
              <div className="section-title text-primary font-semibold mb-3 border-b pb-2">
                {t("departmentPortal.reports.departmentTeachers")}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                {stats?.teachers?.map((teacher: any, idx: number) => (
                  <div key={idx} className="p-2 bg-muted/30 rounded">
                    {teacher.first_name} {teacher.last_name}
                  </div>
                ))}
              </div>
            </div>

            {/* Exams */}
            <div className="section">
              <div className="section-title text-primary font-semibold mb-3 border-b pb-2">
                {t("departmentPortal.reports.periodExams")}
              </div>
              {stats?.exams && stats.exams.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="p-2 text-left">{t("departmentPortal.reports.exam")}</th>
                      <th className="p-2 text-left">{t("departmentPortal.reports.subject")}</th>
                      <th className="p-2 text-left">{t("departmentPortal.reports.date")}</th>
                      <th className="p-2 text-left">{t("departmentPortal.reports.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.exams.map((exam: any) => (
                      <tr key={exam.id} className="border-b">
                        <td className="p-2">{exam.name}</td>
                        <td className="p-2">{exam.subjects?.name}</td>
                        <td className="p-2">{format(new Date(exam.exam_date), 'd MMM yyyy', { locale: dateFnsLocale() })}</td>
                        <td className="p-2 capitalize">{exam.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-muted-foreground text-sm">{t("departmentPortal.reports.noExam")}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
