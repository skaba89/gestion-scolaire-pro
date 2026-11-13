import { useDepartmentTeachers } from "@/features/departments/hooks/useDepartment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Users, Clock, BookOpen, GraduationCap } from "lucide-react";
import { resolveUploadUrl } from "@/utils/url";
import { useTranslation } from "react-i18next";

const MAX_MONTHLY_HOURS = 40;

export default function DepartmentTeachers() {
  const { t } = useTranslation();
  const { data, isLoading } = useDepartmentTeachers();

  const department = data?.department;
  const teachers = data?.teachers || [];

  const totalTeachers = teachers.length;
  const totalAssignments = teachers.reduce((s, t) => s + t.assignment_count, 0);
  const totalHours = teachers.reduce((s, t) => s + t.hours_this_month, 0);
  const uniqueSubjects = new Set(teachers.flatMap((t) => t.subjects)).size;

  if (isLoading) {
    return <div className="p-6">{t("departmentPortal.loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("departmentPortal.teachers.title")}</h1>
        <p className="text-muted-foreground">
          {t("departmentPortal.departmentName", { name: department?.name || t("departmentPortal.notAssigned") })}
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("departmentPortal.teachers.teachers")}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTeachers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("departmentPortal.teachers.assignments")}</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAssignments}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("departmentPortal.teachers.subjects")}</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{uniqueSubjects}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("departmentPortal.teachers.hoursThisMonth")}</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHours.toFixed(1)}h</div>
          </CardContent>
        </Card>
      </div>

      {/* Teachers List */}
      <Card>
        <CardHeader>
          <CardTitle>{t("departmentPortal.teachers.list")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("departmentPortal.col.teacher")}</TableHead>
                <TableHead>{t("departmentPortal.col.email")}</TableHead>
                <TableHead>{t("departmentPortal.col.subjects")}</TableHead>
                <TableHead>{t("departmentPortal.col.classes")}</TableHead>
                <TableHead>{t("departmentPortal.col.hoursMonth")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teachers.map((teacher) => (
                <TableRow key={teacher.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={resolveUploadUrl(teacher.avatar_url)} />
                        <AvatarFallback>
                          {teacher.first_name?.[0]}{teacher.last_name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{teacher.first_name} {teacher.last_name}</div>
                        {teacher.phone && (
                          <div className="text-sm text-muted-foreground">{teacher.phone}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{teacher.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {teacher.subjects.map((subject, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">{subject}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {teacher.classrooms_names.map((name, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">{name}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="text-sm font-medium">{teacher.hours_this_month.toFixed(1)}h</div>
                      <Progress value={(teacher.hours_this_month / MAX_MONTHLY_HOURS) * 100} className="h-2" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {teachers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {t("departmentPortal.teachers.none")}
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
