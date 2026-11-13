import { useDepartmentClassrooms } from "@/features/departments/hooks/useDepartment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

const DepartmentClassrooms = () => {
  const { t } = useTranslation();
  const { data, isLoading } = useDepartmentClassrooms();
  const classrooms = data || [];

  if (isLoading) return <div className="p-6">{t("departmentPortal.loading")}</div>;

  const totalCapacity = classrooms.reduce((sum, c) => sum + (c.capacity || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("departmentPortal.classrooms.title")}</h1>
        <p className="text-muted-foreground">{t("departmentPortal.classrooms.subtitle")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("departmentPortal.classrooms.total")}</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{classrooms.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("departmentPortal.classrooms.levels")}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(classrooms.map((c) => c.level_name).filter(Boolean)).size}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("departmentPortal.classrooms.capacity")}</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalCapacity}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("departmentPortal.classrooms.list")}</CardTitle></CardHeader>
        <CardContent>
          {classrooms.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {t("departmentPortal.classrooms.none")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("departmentPortal.col.name")}</TableHead>
                  <TableHead>{t("departmentPortal.col.level")}</TableHead>
                  <TableHead>{t("departmentPortal.col.section")}</TableHead>
                  <TableHead>{t("departmentPortal.col.capacity")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classrooms.map((classroom) => (
                  <TableRow key={classroom.id}>
                    <TableCell className="font-medium">{classroom.name}</TableCell>
                    <TableCell>{classroom.level_name || "-"}</TableCell>
                    <TableCell>{classroom.section || "-"}</TableCell>
                    <TableCell>
                      {classroom.capacity ? (
                        <Badge variant="outline">{classroom.capacity} places</Badge>
                      ) : "-"}
                    </TableCell>
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

export default DepartmentClassrooms;
