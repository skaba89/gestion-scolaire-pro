import { useDepartmentTeachers } from "@/features/departments/hooks/useDepartment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Users, Clock, BookOpen, GraduationCap } from "lucide-react";
import { resolveUploadUrl } from "@/utils/url";

const MAX_MONTHLY_HOURS = 40;

export default function DepartmentTeachers() {
  const { data, isLoading } = useDepartmentTeachers();

  const department = data?.department;
  const teachers = data?.teachers || [];

  const totalTeachers = teachers.length;
  const totalAssignments = teachers.reduce((s, t) => s + t.assignment_count, 0);
  const totalHours = teachers.reduce((s, t) => s + t.hours_this_month, 0);
  const uniqueSubjects = new Set(teachers.flatMap((t) => t.subjects)).size;

  if (isLoading) {
    return <div className="p-6">Chargement...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Enseignants du département</h1>
        <p className="text-muted-foreground">
          Département: {department?.name || "Non assigné"}
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Enseignants</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTeachers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Affectations</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAssignments}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Matières</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{uniqueSubjects}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Heures (ce mois)</CardTitle>
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
          <CardTitle>Liste des enseignants</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Enseignant</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Matières</TableHead>
                <TableHead>Classes</TableHead>
                <TableHead>Heures (mois)</TableHead>
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
                    Aucun enseignant assigné à ce département
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
