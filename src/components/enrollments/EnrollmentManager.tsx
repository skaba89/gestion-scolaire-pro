import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { UserPlus, Users, RefreshCw, Loader2 } from "lucide-react";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { academicYearQueries } from "@/queries/academic-years";
import { classroomQueries } from "@/queries/classrooms";
import { useDepartments } from "@/queries/departments";
import { useStudents } from "@/hooks/queries/useStudents";
import { useEnrollments } from "@/hooks/queries/useEnrollments";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { StaggerContainer, StaggerItem } from "@/components/layouts/PageTransition";

export const EnrollmentManager = () => {
  const { tenant } = useAuth();
  const { StudentsLabel, studentsLabel, studentLabel, getLabel } = useStudentLabel();
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedClassroom, setSelectedClassroom] = useState<string>("");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);

  const parentUnenrolledRef = useRef<HTMLDivElement>(null);
  const parentEnrolledRef = useRef<HTMLDivElement>(null);

  // Data fetching using unified hooks
  const { data: academicYears = [] } = useQuery(academicYearQueries.all(tenant?.id || ""));
  const { data: classrooms = [] } = useQuery(classroomQueries.all(tenant?.id || ""));
  const { data: departments = [] } = useDepartments(tenant?.id);
  const { students = [] } = useStudents(tenant?.id || "", false, {
    fields: "id, first_name, last_name, department_id, registration_number"
  });

  // Fetch ALL enrollments of the year to correctly identify truly unenrolled students
  const { enrollments: allYearEnrollments = [] } = useEnrollments(tenant?.id || "", selectedYear, "all");

  // Fetch enrollments for the SELECTED classroom for the "Enrolled" list
  const {
    enrollments: classroomEnrollments = [],
    enrollStudents,
    removeEnrollment,
    isLoading: isEnrollmentsLoading
  } = useEnrollments(tenant?.id || "", selectedYear, selectedClassroom);

  // Initial year selection
  useEffect(() => {
    if (academicYears.length > 0 && !selectedYear) {
      const current = academicYears.find(y => y.is_current);
      if (current) setSelectedYear(current.id);
    }
  }, [academicYears, selectedYear]);

  // Calculate unenrolled students
  const unenrolledStudents = useMemo(() => {
    if (!selectedYear) return [];

    const enrolledIdsInYear = new Set(allYearEnrollments.map(e => e.student_id));

    let filtered = (students || []).filter(s => !enrolledIdsInYear.has(s.id));

    if (selectedDepartment !== "all") {
      filtered = filtered.filter(s => s.department_id === selectedDepartment);
    }
    return filtered;
  }, [students, allYearEnrollments, selectedYear, selectedDepartment]);

  // Virtualization for unenrolled list
  const unenrolledVirtualizer = useVirtualizer({
    count: unenrolledStudents.length,
    getScrollElement: () => parentUnenrolledRef.current,
    estimateSize: () => 50,
    overscan: 10,
  });

  // Virtualization for enrolled list
  const enrolledVirtualizer = useVirtualizer({
    count: classroomEnrollments.length,
    getScrollElement: () => parentEnrolledRef.current,
    estimateSize: () => 50,
    overscan: 10,
  });

  const handleEnrollStudents = async () => {
    if (!selectedYear || !selectedClassroom || selectedStudents.length === 0 || !tenant?.id) {
      toast.error(`Veuillez sélectionner une année, une classe et des ${studentsLabel}`);
      return;
    }

    const classroom = classrooms.find((c) => c.id === selectedClassroom);
    const enrollmentData = selectedStudents.map((studentId) => ({
      tenant_id: tenant.id,
      student_id: studentId,
      academic_year_id: selectedYear,
      class_id: selectedClassroom,
      level_id: classroom?.level_id || null,
      status: "ACTIVE",
    }));

    try {
      await enrollStudents(enrollmentData);
      setSelectedStudents([]);
      toast.success(`${selectedStudents.length} ${studentsLabel} inscrits avec succès`);
    } catch (error) {
      toast.error("Erreur lors de l'inscription");
    }
  };

  const handleAutoAssign = async () => {
    if (!selectedYear || !tenant?.id) {
      toast.error("Veuillez sélectionner une année académique");
      return;
    }

    if (unenrolledStudents.length === 0) {
      toast.info(`Tous les ${studentsLabel} sont déjà inscrits`);
      return;
    }

    const classroomsWithSpace = classrooms.filter((c) => c.capacity && c.capacity > 0);
    if (classroomsWithSpace.length === 0) {
      toast.error("Aucune classe avec capacité disponible");
      return;
    }

    const enrollmentData: any[] = [];
    let classroomIndex = 0;

    for (const student of unenrolledStudents) {
      const classroom = classroomsWithSpace[classroomIndex % classroomsWithSpace.length];
      enrollmentData.push({
        tenant_id: tenant.id,
        student_id: student.id,
        academic_year_id: selectedYear,
        class_id: classroom.id,
        level_id: classroom.level_id || null,
        status: "ACTIVE",
      });
      classroomIndex++;
    }

    try {
      await enrollStudents(enrollmentData);
      toast.success("Affectation automatique terminée");
    } catch (error) {
      toast.error("Erreur lors de l'affectation automatique");
    }
  };

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudents((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  };

  const selectedClassroomData = classrooms.find((c) => c.id === selectedClassroom);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Gestion des Inscriptions {getLabel("of_students", true)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Année Académique</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une année" />
                </SelectTrigger>
                <SelectContent>
                  {academicYears.map((year) => (
                    <SelectItem key={year.id} value={year.id}>
                      {year.name} {year.is_current && "(en cours)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Classe</label>
              <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une classe" />
                </SelectTrigger>
                <SelectContent>
                  {classrooms.map((classroom) => (
                    <SelectItem key={classroom.id} value={classroom.id}>
                      {classroom.name} {classroom.level && `(${classroom.level.name})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Département (Filtre)</label>
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger>
                  <SelectValue placeholder="Tous les départements" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les départements</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleAutoAssign} variant="outline" className="w-full">
                <RefreshCw className="h-4 w-4 mr-2" />
                Affectation Automatique
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {StudentsLabel} Non Inscrits ({unenrolledStudents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedYear ? (
              <>
                <div
                  ref={parentUnenrolledRef}
                  className="h-80 overflow-y-auto space-y-2 mb-4 relative border rounded-md p-2"
                >
                  {unenrolledStudents.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">
                      Tous les {studentsLabel} sont inscrits
                    </p>
                  ) : (
                    <StaggerContainer className="contents">
                      {unenrolledVirtualizer.getVirtualItems().map((virtualRow) => {
                        const student = unenrolledStudents[virtualRow.index];
                        if (!student) return null;
                        return (
                          <StaggerItem
                            key={student.id}
                            style={{
                              position: 'absolute',
                              top: 0,
                              transform: `translateY(${virtualRow.start}px)`,
                              width: '100%',
                              height: `${virtualRow.size}px`
                            }}
                          >
                            <div
                              className="flex items-center gap-3 p-2 rounded border hover:bg-muted/50 cursor-pointer mb-2"
                              onClick={() => toggleStudentSelection(student.id)}
                            >
                              <Checkbox
                                checked={selectedStudents.includes(student.id)}
                                onCheckedChange={() => toggleStudentSelection(student.id)}
                              />
                              <span className="flex-1 text-sm truncate">
                                {student.last_name} {student.first_name}
                                {student.department_id && (
                                  <span className="ml-2 text-[10px] text-muted-foreground italic">
                                    ({departments.find(d => d.id === student.department_id)?.name})
                                  </span>
                                )}
                              </span>
                              {student.registration_number && (
                                <Badge variant="outline" className="text-[10px]">{student.registration_number}</Badge>
                              )}
                            </div>
                          </StaggerItem>
                        );
                      })}
                    </StaggerContainer>
                  )}
                </div>
                {selectedStudents.length > 0 && selectedClassroom && (
                  <Button onClick={handleEnrollStudents} className="w-full">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Inscrire {selectedStudents.length} {studentsLabel} dans {selectedClassroomData?.name}
                  </Button>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-center py-4">
                Sélectionnez une année académique
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {StudentsLabel} Inscrits {selectedClassroomData && `- ${selectedClassroomData.name}`} ({classroomEnrollments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isEnrollmentsLoading ? (
              <TableSkeleton columns={4} rows={5} />
            ) : selectedClassroom ? (
              <div
                ref={parentEnrolledRef}
                className="h-80 overflow-y-auto border rounded-md relative"
              >
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>N° Étudiant</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {classroomEnrollments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          Aucun {studentLabel} inscrit dans cette classe
                        </TableCell>
                      </TableRow>
                    ) : (
                      <StaggerContainer className="contents">
                        {enrolledVirtualizer.getVirtualItems().map((virtualRow) => {
                          const enrollment = classroomEnrollments[virtualRow.index];
                          if (!enrollment) return null;
                          return (
                            <StaggerItem
                              key={enrollment.id}
                              style={{
                                position: 'absolute',
                                top: 0,
                                transform: `translateY(${virtualRow.start}px)`,
                                width: '100%',
                                height: `${virtualRow.size}px`
                              }}
                              className="contents"
                            >
                              <TableRow className="contents">
                                <TableCell className="w-[40%]">
                                  {enrollment.student?.last_name} {enrollment.student?.first_name}
                                </TableCell>
                                <TableCell className="w-[30%]">
                                  <Badge variant="outline" className="text-[10px]">{enrollment.student?.registration_number || "-"}</Badge>
                                </TableCell>
                                <TableCell className="w-[20%]">
                                  <Badge variant={enrollment.status === "ACTIVE" ? "default" : "secondary"} className="text-[10px]">
                                    {enrollment.status === "ACTIVE" ? "Actif" : enrollment.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="w-[10%]">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => removeEnrollment(enrollment.id)}
                                  >
                                    <RefreshCw className="w-4 h-4 text-muted-foreground" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            </StaggerItem>
                          );
                        })}
                      </StaggerContainer>
                    )}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">
                Sélectionnez une classe pour voir les {studentsLabel} inscrits
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
