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

const DepartmentStudents = () => {
  const [selectedClassroom, setSelectedClassroom] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const { data, isLoading } = useDepartmentStudents(
    selectedClassroom !== "all" ? selectedClassroom : undefined,
    searchTerm || undefined
  );

  const students = data?.students || [];
  const classrooms = data?.classrooms || [];

  if (isLoading) {
    return <div className="p-6">Chargement...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Étudiants du département</h1>
        <p className="text-muted-foreground">
          Liste des étudiants inscrits dans les classes de votre département
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom ou numéro d'étudiant..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {students.length} étudiant(s)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {students.length === 0 ? (
            <div className="text-center py-8">
              <GraduationCap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Aucun étudiant trouvé</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Photo</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>N° Étudiant</TableHead>
                  <TableHead>Classe</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Téléphone</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell>
                      {student.photo_url ? (
                        <img
                          src={student.photo_url}
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
