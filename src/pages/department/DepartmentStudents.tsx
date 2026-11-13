import { useState } from "react";
import { useDepartmentStudents } from "@/features/departments/hooks/useDepartment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Users, Search, GraduationCap } from "lucide-react";
import { resolveUploadUrl } from "@/utils/url";
import { useTranslation } from "react-i18next";

const DepartmentStudents = () => {
  const { t } = useTranslation();
  const [selectedClassroom, setSelectedClassroom] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const { data, isLoading } = useDepartmentStudents(
    selectedClassroom !== "all" ? selectedClassroom : undefined,
    searchTerm || undefined
  );

  const students = data?.students || [];
  const classrooms = data?.classrooms || [];

  if (isLoading) {
    return <div className="p-6">{t("departmentPortal.loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("departmentPortal.students.title")}</h1>
        <p className="text-muted-foreground">
          {t("departmentPortal.students.subtitle")}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("departmentPortal.students.search")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t("departmentPortal.students.count", { count: students.length })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {students.length === 0 ? (
            <div className="text-center py-8">
              <GraduationCap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">{t("departmentPortal.students.none")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("departmentPortal.col.photo")}</TableHead>
                  <TableHead>{t("departmentPortal.col.name")}</TableHead>
                  <TableHead>{t("departmentPortal.col.studentNumber")}</TableHead>
                  <TableHead>{t("departmentPortal.col.class")}</TableHead>
                  <TableHead>{t("departmentPortal.col.email")}</TableHead>
                  <TableHead>{t("departmentPortal.col.phone")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell>
                      {student.photo_url ? (
                        <img
                          src={resolveUploadUrl(student.photo_url)}
                          alt={`${student.first_name} ${student.last_name}`}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                          {student.first_name?.[0]}{student.last_name?.[0]}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {student.first_name} {student.last_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{student.registration_number || "-"}</Badge>
                    </TableCell>
                    <TableCell>{student.classroom?.name || "-"}</TableCell>
                    <TableCell>{student.email || "-"}</TableCell>
                    <TableCell>{student.phone || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DepartmentStudents;
