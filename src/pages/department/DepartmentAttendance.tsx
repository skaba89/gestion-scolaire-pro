import { useState } from "react";
import { useDepartmentAttendance } from "@/features/departments/hooks/useDepartment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { Users, UserCheck, UserX, Clock, Calendar } from "lucide-react";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { dateFnsLocale } from "@/lib/locale";
import { useTranslation } from "react-i18next";

export default function DepartmentAttendance() {
  const { t } = useTranslation();
  const { studentLabel } = useStudentLabel();
  const [selectedClassroom, setSelectedClassroom] = useState("all");
  const [period, setPeriod] = useState<"week" | "month">("week");

  const { data, isLoading } = useDepartmentAttendance(
    period,
    selectedClassroom !== "all" ? selectedClassroom : undefined
  );

  const classrooms = data?.classrooms || [];
  const records = data?.records || [];
  const stats = data?.stats || { total: 0, present: 0, absent: 0, late: 0, excused: 0, attendance_rate: 0 };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PRESENT": return <Badge className="bg-green-500">{t("attendanceHistory.PRESENT")}</Badge>;
      case "ABSENT": return <Badge variant="destructive">{t("attendanceHistory.ABSENT")}</Badge>;
      case "LATE": return <Badge className="bg-yellow-500">{t("attendanceHistory.LATE")}</Badge>;
      case "EXCUSED": return <Badge variant="secondary">{t("attendanceHistory.EXCUSED")}</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("departmentPortal.attendance.title")}</h1>
        <p className="text-muted-foreground">
          {t("departmentPortal.departmentName", { name: data?.department?.name || t("departmentPortal.notAssigned") })}
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t("departmentPortal.allClasses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("departmentPortal.allClasses")}</SelectItem>
            {classrooms.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={period} onValueChange={(v) => setPeriod(v as "week" | "month")}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t("departmentPortal.attendance.period")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">{t("departmentPortal.attendance.thisWeek")}</SelectItem>
            <SelectItem value="month">{t("departmentPortal.attendance.thisMonth")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("departmentPortal.attendance.total")}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.total}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("departmentPortal.attendance.present")}</CardTitle>
            <UserCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{stats.present}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("departmentPortal.attendance.absent")}</CardTitle>
            <UserX className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">{stats.absent}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("departmentPortal.attendance.late")}</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-yellow-600">{stats.late}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("departmentPortal.attendance.rate")}</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.attendance_rate.toFixed(1)}%</div>
            <Progress value={stats.attendance_rate} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Attendance Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("departmentPortal.attendance.history")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("departmentPortal.col.date")}</TableHead>
                <TableHead>{studentLabel.charAt(0).toUpperCase() + studentLabel.slice(1)}</TableHead>
                <TableHead>{t("departmentPortal.col.studentNumber")}</TableHead>
                <TableHead>{t("departmentPortal.col.class")}</TableHead>
                <TableHead>{t("departmentPortal.col.status")}</TableHead>
                <TableHead>{t("departmentPortal.col.notes")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>
                    {format(new Date(record.date), "dd/MM/yyyy", { locale: dateFnsLocale() })}
                  </TableCell>
                  <TableCell>
                    {record.students?.first_name} {record.students?.last_name}
                  </TableCell>
                  <TableCell>{record.students?.registration_number || "-"}</TableCell>
                  <TableCell>{record.classrooms?.name}</TableCell>
                  <TableCell>{getStatusBadge(record.status)}</TableCell>
                  <TableCell className="text-muted-foreground">{record.notes || "-"}</TableCell>
                </TableRow>
              ))}
              {records.length === 0 && !isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {t("departmentPortal.attendance.none")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
