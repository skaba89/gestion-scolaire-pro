import { useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, subDays, startOfWeek, endOfWeek, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import { Download, FileText, AlertTriangle, Filter, Bell, FileSpreadsheet, Mail, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

const ATTENDANCE_THRESHOLD = 80; // Alert if below 80%

// CSV Export utility
const exportToCSV = (data: any[], filename: string) => {
  if (!data || data.length === 0) {
    toast.error("Aucune donnée à exporter");
    return;
  }

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(';'),
    ...data.map(row => headers.map(header => {
      const value = row[header];
      // Handle values with commas or semicolons
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
  toast.success("Export CSV réussi");
};

export default function DepartmentReports() {
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
      const { data } = await supabase
        .from('department_members')
        .select('department_id, departments(id, name, code)')
        .eq('user_id', user?.id || '')
        .eq('tenant_id', tenant?.id || '')
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id && !!tenant?.id,
  });

  // Get classrooms for this department
  const { data: departmentClassrooms } = useQuery({
    queryKey: ['department-classrooms-report', userDepartment?.department_id, tenant?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('classroom_departments')
        .select('class_id, classrooms:class_id(id, name)')
        .eq('department_id', userDepartment?.department_id || '')
        .eq('tenant_id', tenant?.id || '');
      return data || [];
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

      // Get current academic year
      const { data: currentYear } = await supabase
        .from('academic_years')
        .select('id, name')
        .eq('tenant_id', tenant?.id || '')
        .eq('is_current', true)
        .maybeSingle();

      // Count students
      const { count: studentCount } = await supabase
        .from('enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant?.id || '')
        .eq('status', 'active')
        .in('class_id', classroomIds);

      // Get teachers
      const { data: teacherData } = await supabase
        .from('teacher_assignments')
        .select('teacher_id, profiles:teacher_id(first_name, last_name)')
        .eq('tenant_id', tenant?.id || '')
        .in('class_id', classroomIds);

      const uniqueTeachers = new Map();
      teacherData?.forEach((t: any) => {
        if (t.profiles) uniqueTeachers.set(t.teacher_id, t.profiles);
      });

      // Get attendance stats for period
      const { data: attendanceData } = await supabase
        .from('attendance')
        .select('status, class_id')
        .eq('tenant_id', tenant?.id || '')
        .in('class_id', classroomIds)
        .gte('date', startDate)
        .lte('date', endDate);

      const totalAttendance = attendanceData?.length || 0;
      const presentCount = attendanceData?.filter(a => a.status === 'PRESENT').length || 0;
      const absentCount = attendanceData?.filter(a => a.status === 'ABSENT').length || 0;
      const lateCount = attendanceData?.filter(a => a.status === 'LATE').length || 0;

      // Calculate attendance per classroom for alerts
      const attendancePerClass: Record<string, { total: number; present: number; late: number }> = {};
      attendanceData?.forEach(a => {
        if (!attendancePerClass[a.class_id]) {
          attendancePerClass[a.class_id] = { total: 0, present: 0, late: 0 };
        }
        attendancePerClass[a.class_id].total++;
        if (a.status === 'PRESENT') attendancePerClass[a.class_id].present++;
        if (a.status === 'LATE') attendancePerClass[a.class_id].late++;
      });

      // Get grades stats
      const { data: gradesData } = await supabase
        .from('grades')
        .select('score, class_id, assessments!inner(max_score, date)')
        .eq('tenant_id', tenant?.id || '')
        .in('class_id', classroomIds)
        .gte('assessments.date', startDate)
        .lte('assessments.date', endDate);

      let totalScore = 0;
      let gradeCount = 0;
      gradesData?.forEach((g: any) => {
        if (g.score !== null) {
          const normalized = (g.score / (g.assessments?.max_score || 20)) * 20;
          totalScore += normalized;
          gradeCount++;
        }
      });
      const averageGrade = gradeCount > 0 ? totalScore / gradeCount : 0;

      // Get exams for period
      const { data: examsData } = await supabase
        .from('exams')
        .select('id, name, exam_date, status, subjects(name)')
        .eq('tenant_id', tenant?.id || '')
        .eq('department_id', userDepartment?.department_id || '')
        .gte('exam_date', startDate)
        .lte('exam_date', endDate);

      // Students per classroom
      const { data: enrollmentsData } = await supabase
        .from('enrollments')
        .select('class_id, classrooms(name)')
        .eq('tenant_id', tenant?.id || '')
        .eq('status', 'active')
        .in('class_id', classroomIds);

      const studentsPerClass: Record<string, { name: string; count: number }> = {};
      enrollmentsData?.forEach((e: any) => {
        const id = e.class_id;
        const name = e.classrooms?.name || 'N/A';
        if (!studentsPerClass[id]) studentsPerClass[id] = { name, count: 0 };
        studentsPerClass[id].count++;
      });

      return {
        academicYear: currentYear?.name || 'N/A',
        studentCount: studentCount || 0,
        teacherCount: uniqueTeachers.size,
        teachers: Array.from(uniqueTeachers.values()),
        attendance: {
          total: totalAttendance,
          present: presentCount,
          absent: absentCount,
          late: lateCount,
          rate: totalAttendance > 0 ? ((presentCount + lateCount) / totalAttendance) * 100 : 0,
        },
        attendancePerClass,
        averageGrade,
        gradeCount,
        exams: examsData || [],
        studentsPerClass: Object.values(studentsPerClass),
        classrooms: departmentClassrooms?.map(cd => (cd.classrooms as any)?.name).filter(Boolean) || [],
        periodLabel: getPeriodLabel(),
      };
    },
    enabled: classroomIds.length > 0 && !!tenant?.id && !!userDepartment?.department_id,
  });

  const getPeriodLabel = () => {
    switch (selectedPeriod) {
      case "week": return "Cette semaine";
      case "month": return "Ce mois";
      case "3months": return "3 derniers mois";
      case "30days":
      default: return "30 derniers jours";
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
              classroomName: (classroom?.classrooms as any)?.name || 'Classe inconnue',
              rate: rate.toFixed(1),
              total: data.total,
              absent: data.total - data.present - data.late,
            });
          }
        }
      });

      setLowAttendanceAlerts(alerts);

      // Show toast for critical alerts
      if (alerts.length > 0) {
        toast.warning(`${alerts.length} classe(s) avec un taux de présence faible détectée(s)`, {
          icon: <Bell className="h-4 w-4" />,
        });
      }
    }
  }, [stats?.attendancePerClass, departmentClassrooms]);

  const [isSendingAlert, setIsSendingAlert] = useState(false);

  // Send email alert to department head
  const sendEmailAlert = async () => {
    if (lowAttendanceAlerts.length === 0) {
      toast.info("Aucune alerte à envoyer");
      return;
    }

    setIsSendingAlert(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-department-alert', {
        body: {
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
        },
      });

      if (error) throw error;

      // Save to history
      await supabase.from('department_alert_history').insert({
        tenant_id: tenant?.id,
        department_id: userDepartment?.department_id,
        sent_by: user?.id,
        alert_type: 'manual',
        period_label: getPeriodLabel(),
        alerts_data: lowAttendanceAlerts,
        email_sent: true,
      });

      toast.success("Alerte envoyée par email au chef de département");
    } catch (error: any) {
      console.error("Error sending alert:", error);
      toast.error("Erreur lors de l'envoi de l'alerte");
    } finally {
      setIsSendingAlert(false);
    }
  };

  // Export functions
  const exportAttendanceCSV = () => {
    if (!stats) return;

    const data = [
      {
        "Catégorie": "Présents",
        "Nombre": stats.attendance.present,
        "Pourcentage": `${((stats.attendance.present / (stats.attendance.total || 1)) * 100).toFixed(1)}%`
      },
      {
        "Catégorie": "Absents",
        "Nombre": stats.attendance.absent,
        "Pourcentage": `${((stats.attendance.absent / (stats.attendance.total || 1)) * 100).toFixed(1)}%`
      },
      {
        "Catégorie": "Retards",
        "Nombre": stats.attendance.late,
        "Pourcentage": `${((stats.attendance.late / (stats.attendance.total || 1)) * 100).toFixed(1)}%`
      },
      {
        "Catégorie": "Total",
        "Nombre": stats.attendance.total,
        "Pourcentage": "100%"
      }
    ];

    exportToCSV(data, `presence_${(userDepartment?.departments as any)?.code || 'dept'}`);
  };

  const exportStudentsCSV = () => {
    if (!stats?.studentsPerClass) return;

    const data = stats.studentsPerClass.map((cls: any) => ({
      "Classe": cls.name,
      "Nombre d'étudiants": cls.count,
    }));

    exportToCSV(data, `etudiants_par_classe_${(userDepartment?.departments as any)?.code || 'dept'}`);
  };

  const exportTeachersCSV = () => {
    if (!stats?.teachers) return;

    const data = stats.teachers.map((t: any) => ({
      "Prénom": t.first_name || '',
      "Nom": t.last_name || '',
    }));

    exportToCSV(data, `enseignants_${(userDepartment?.departments as any)?.code || 'dept'}`);
  };

  const exportExamsCSV = () => {
    if (!stats?.exams) return;

    const data = stats.exams.map((e: any) => ({
      "Examen": e.name,
      "Matière": e.subjects?.name || '',
      "Date": format(new Date(e.exam_date), 'dd/MM/yyyy'),
      "Statut": e.status,
    }));

    exportToCSV(data, `examens_${(userDepartment?.departments as any)?.code || 'dept'}`);
  };

  const exportFullReportCSV = () => {
    if (!stats) return;

    const data = [
      { "Section": "Vue d'ensemble", "Indicateur": "Étudiants", "Valeur": stats.studentCount },
      { "Section": "Vue d'ensemble", "Indicateur": "Enseignants", "Valeur": stats.teacherCount },
      { "Section": "Vue d'ensemble", "Indicateur": "Taux de présence", "Valeur": `${stats.attendance.rate.toFixed(1)}%` },
      { "Section": "Vue d'ensemble", "Indicateur": "Moyenne générale", "Valeur": `${stats.averageGrade.toFixed(2)}/20` },
      { "Section": "Présences", "Indicateur": "Présents", "Valeur": stats.attendance.present },
      { "Section": "Présences", "Indicateur": "Absents", "Valeur": stats.attendance.absent },
      { "Section": "Présences", "Indicateur": "Retards", "Valeur": stats.attendance.late },
      ...stats.studentsPerClass.map((cls: any) => ({
        "Section": "Étudiants par classe",
        "Indicateur": cls.name,
        "Valeur": cls.count,
      })),
      ...stats.exams.map((e: any) => ({
        "Section": "Examens",
        "Indicateur": e.name,
        "Valeur": format(new Date(e.exam_date), 'dd/MM/yyyy'),
      })),
    ];

    exportToCSV(data, `rapport_complet_${(userDepartment?.departments as any)?.code || 'dept'}`);
  };

  const generatePDF = () => {
    if (!reportRef.current) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error("Impossible d'ouvrir la fenêtre d'impression");
      return;
    }

    const content = reportRef.current.innerHTML;
    const departmentName = (userDepartment?.departments as any)?.name || 'Département';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Rapport - ${departmentName}</title>
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
          <p>Rapport généré le ${format(new Date(), "d MMMM yyyy 'à' HH:mm", { locale: fr })}</p>
          <p>${tenant?.name || ''}</p>
        </div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `);

    printWindow.document.close();
    toast.success("Rapport PDF généré");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Rapports & Statistiques</h1>
          <p className="text-muted-foreground">
            Département: {(userDepartment?.departments as any)?.name || 'Non assigné'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportFullReportCSV}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button onClick={generatePDF}>
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-5 w-5" />
            Filtres avancés
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Période</label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une période" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Cette semaine</SelectItem>
                  <SelectItem value="month">Ce mois</SelectItem>
                  <SelectItem value="30days">30 derniers jours</SelectItem>
                  <SelectItem value="3months">3 derniers mois</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Classe</label>
              <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une classe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les classes</SelectItem>
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
            <span>Alertes de présence faible</span>
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
              Envoyer alerte par email
            </Button>
          </AlertTitle>
          <AlertDescription className="text-yellow-700 dark:text-yellow-300">
            <p className="mb-3">
              Les classes suivantes ont un taux de présence inférieur à {ATTENDANCE_THRESHOLD}% pour la période sélectionnée:
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
                    {alert.absent} absence(s) sur {alert.total} enregistrements
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
            Exports CSV détaillés
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={exportAttendanceCSV}>
              Présences
            </Button>
            <Button variant="outline" size="sm" onClick={exportStudentsCSV}>
              Étudiants par classe
            </Button>
            <Button variant="outline" size="sm" onClick={exportTeachersCSV}>
              Enseignants
            </Button>
            <Button variant="outline" size="sm" onClick={exportExamsCSV}>
              Examens
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Aperçu du rapport
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div ref={reportRef} className="bg-white p-6 rounded-lg">
            {/* Header */}
            <div className="header text-center mb-6 pb-4 border-b-2 border-primary">
              <h1 className="text-2xl font-bold">
                Rapport du Département: {(userDepartment?.departments as any)?.name}
              </h1>
              <p className="text-muted-foreground text-sm">
                Année académique: {stats?.academicYear} |
                Période: {stats?.periodLabel || getPeriodLabel()}
                {selectedClassroom !== "all" && ` | Classe: ${departmentClassrooms?.find(cd => cd.class_id === selectedClassroom)?.classrooms?.name}`}
              </p>
            </div>

            {/* Stats Grid */}
            <div className="section mb-6">
              <div className="section-title text-primary font-semibold mb-3 border-b pb-2">
                Vue d'ensemble
              </div>
              <div className="stats-grid grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="stat-card bg-muted/50 p-4 rounded-lg text-center">
                  <div className="stat-value text-2xl font-bold">{stats?.studentCount || 0}</div>
                  <div className="stat-label text-sm text-muted-foreground">Étudiants</div>
                </div>
                <div className="stat-card bg-muted/50 p-4 rounded-lg text-center">
                  <div className="stat-value text-2xl font-bold">{stats?.teacherCount || 0}</div>
                  <div className="stat-label text-sm text-muted-foreground">Enseignants</div>
                </div>
                <div className="stat-card bg-muted/50 p-4 rounded-lg text-center">
                  <div className={`stat-value text-2xl font-bold ${(stats?.attendance?.rate || 0) < ATTENDANCE_THRESHOLD ? 'text-red-500' : ''}`}>
                    {stats?.attendance?.rate?.toFixed(1) || 0}%
                  </div>
                  <div className="stat-label text-sm text-muted-foreground">Taux de présence</div>
                </div>
                <div className="stat-card bg-muted/50 p-4 rounded-lg text-center">
                  <div className="stat-value text-2xl font-bold">{stats?.averageGrade?.toFixed(2) || 0}/20</div>
                  <div className="stat-label text-sm text-muted-foreground">Moyenne générale</div>
                </div>
              </div>
            </div>

            {/* Classes */}
            <div className="section mb-6">
              <div className="section-title text-primary font-semibold mb-3 border-b pb-2">
                Répartition par classe
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="p-2 text-left">Classe</th>
                    <th className="p-2 text-right">Nombre d'étudiants</th>
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
                Statistiques de présence ({stats?.periodLabel || getPeriodLabel()})
              </div>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div className="p-3 bg-green-50 rounded text-center">
                  <div className="font-bold text-green-700">{stats?.attendance?.present || 0}</div>
                  <div className="text-green-600">Présents</div>
                </div>
                <div className="p-3 bg-red-50 rounded text-center">
                  <div className="font-bold text-red-700">{stats?.attendance?.absent || 0}</div>
                  <div className="text-red-600">Absents</div>
                </div>
                <div className="p-3 bg-yellow-50 rounded text-center">
                  <div className="font-bold text-yellow-700">{stats?.attendance?.late || 0}</div>
                  <div className="text-yellow-600">Retards</div>
                </div>
                <div className="p-3 bg-blue-50 rounded text-center">
                  <div className="font-bold text-blue-700">{stats?.attendance?.total || 0}</div>
                  <div className="text-blue-600">Total</div>
                </div>
              </div>
            </div>

            {/* Teachers */}
            <div className="section mb-6">
              <div className="section-title text-primary font-semibold mb-3 border-b pb-2">
                Enseignants du département
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
                Examens de la période
              </div>
              {stats?.exams && stats.exams.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="p-2 text-left">Examen</th>
                      <th className="p-2 text-left">Matière</th>
                      <th className="p-2 text-left">Date</th>
                      <th className="p-2 text-left">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.exams.map((exam: any) => (
                      <tr key={exam.id} className="border-b">
                        <td className="p-2">{exam.name}</td>
                        <td className="p-2">{exam.subjects?.name}</td>
                        <td className="p-2">{format(new Date(exam.exam_date), 'd MMM yyyy', { locale: fr })}</td>
                        <td className="p-2 capitalize">{exam.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-muted-foreground text-sm">Aucun examen programmé pour cette période</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
