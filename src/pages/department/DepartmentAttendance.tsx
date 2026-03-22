import { useState } from "react";
import { useDepartmentAttendance } from "@/features/departments/hooks/useDepartment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Users, UserCheck, UserX, Clock, Calendar } from "lucide-react";
import { useStudentLabel } from "@/hooks/useStudentLabel";

export default function DepartmentAttendance() {
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
      case "PRESENT": return <Badge className="bg-green-500">Présent</Badge>;
      case "ABSENT": return <Badge variant="destructive">Absent</Badge>;
      case "LATE": return <Badge className="bg-yellow-500">En retard</Badge>;
      case "EXCUSED": return <Badge variant="secondary">Excusé</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Suivi des présences</h1>
        <p className="text-muted-foreground">
          Département: {data?.department?.name || "Non assigné"}
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Toutes les classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les classes</SelectItem>
            {classrooms.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={period} onValueChange={(v) => setPeriod(v as "week" | "month")}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Période" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Cette semaine</SelectItem>
            <SelectItem value="month">Ce mois</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.total}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Présents</CardTitle>
            <UserCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{stats.present}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Absents</CardTitle>
            <UserX className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">{stats.absent}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">En retard</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-yellow-600">{stats.late}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taux de présence</CardTitle>
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
          <CardTitle>Historique des présences</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>{studentLabel.charAt(0).toUpperCase() + studentLabel.slice(1)}</TableHead>
                <TableHead>N° Étudiant</TableHead>
                <TableHead>Classe</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>
                    {format(new Date(record.date), "dd/MM/yyyy", { locale: fr })}
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
                    Aucune donnée de présence pour cette période
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
