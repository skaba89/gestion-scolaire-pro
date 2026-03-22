import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, Building2, Layers, Search, School } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StudentAvatar } from "@/components/students/StudentAvatar";
import { referenceQueries } from "@/queries/reference-data";
import { useStudentLabel } from "@/hooks/useStudentLabel";

const ClassLists = () => {
    const { tenant } = useTenant();
    const { studentLabel, StudentLabel, studentsLabel, StudentsLabel } = useStudentLabel();
    const [selectedDept, setSelectedDept] = useState<string>("all");
    const [selectedLevel, setSelectedLevel] = useState<string>("all");
    const [searchTerm, setSearchTerm] = useState("");

    const { data: departments = [] } = useQuery({
        ...referenceQueries.departments(tenant?.id || ""),
        enabled: !!tenant,
    });

    const { data: levels = [] } = useQuery({
        ...referenceQueries.levels(tenant?.id || ""),
        enabled: !!tenant,
    });

    const { data: classLists = [], isLoading } = useQuery({
        queryKey: ["class-lists", tenant?.id, selectedDept, selectedLevel],
        queryFn: async () => {
            if (!tenant?.id) return [];

            let query = supabase
                .from("classes")
                .select(`
          id,
          name,
          capacity,
          level:levels(id, name),
          campus:campuses(name)
        `)
                .eq("tenant_id", tenant.id);

            if (selectedLevel !== "all") {
                query = query.eq("level_id", selectedLevel);
            }

            const { data: classrooms, error: classError } = await query;
            if (classError) throw classError;

            let filteredClassrooms = classrooms || [];

            // Filter by department if needed
            if (selectedDept !== "all") {
                const { data: classDepts, error: deptError } = await supabase
                    .from("classroom_departments")
                    .select("class_id")
                    .eq("tenant_id", tenant.id)
                    .eq("department_id", selectedDept);

                if (deptError) {
                    console.error("Error fetching classroom departments:", deptError);
                    throw deptError;
                }

                const validIds = new Set(classDepts?.map(cd => cd.class_id) || []);
                console.log("Valid classroom IDs for dept:", selectedDept, "Found:", validIds.size);
                filteredClassrooms = filteredClassrooms.filter(c => validIds.has(c.id));
            }

            // Fetch all enrollments for these classrooms in ONE bulk query
            const classroomIds = filteredClassrooms.map(c => c.id);
            const { data: allEnrollments, error: enrollError } = await supabase
                .from("enrollments")
                .select(`id, student_id, class_id`)
                .in("class_id", classroomIds)
                .eq("tenant_id", tenant.id)
                .eq("status", "ACTIVE");

            if (enrollError) throw enrollError;

            // Fetch all students for these enrollments in ONE bulk query
            const studentIds = [...new Set(allEnrollments?.map(e => e.student_id) || [])];
            const { data: studentsData, error: studentError } = await supabase
                .from("students")
                .select(`id, first_name, last_name, registration_number, photo_url, email`)
                .in("id", studentIds);

            if (studentError) throw studentError;

            // Map students for easy lookup
            const studentMap = (studentsData || []).reduce((acc, student) => {
                acc[student.id] = student;
                return acc;
            }, {} as Record<string, any>);

            // Group students by classroom
            const fullLists = filteredClassrooms.map(classroom => {
                const classroomEnrollments = allEnrollments?.filter(e => e.class_id === classroom.id) || [];
                const students = classroomEnrollments
                    .map(e => studentMap[e.student_id])
                    .filter(Boolean)
                    .sort((a, b) => a.last_name.localeCompare(b.last_name));

                return {
                    ...classroom,
                    students
                };
            });

            return fullLists;
        },
        enabled: !!tenant,
    });

    const filteredLists = classLists.filter(cls =>
        cls.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cls.students.some(s =>
            `${s.first_name} ${s.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.registration_number?.toLowerCase().includes(searchTerm.toLowerCase())
        )
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-display font-bold text-foreground">Listes de Classe</h1>
                    <p className="text-muted-foreground">Consultez les effectifs par département et par niveau</p>
                </div>
            </div>

            <Card>
                <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                                <Building2 className="w-4 h-4" /> Département
                            </label>
                            <Select value={selectedDept} onValueChange={setSelectedDept}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Tous les départements" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Tous les départements</SelectItem>
                                    {departments.map((dept: any) => (
                                        <SelectItem key={dept.id} value={dept.id}>
                                            {dept.code ? `[${dept.code}] ` : ""}{dept.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                                <Layers className="w-4 h-4" /> Niveau
                            </label>
                            <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Tous les niveaux" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Tous les niveaux</SelectItem>
                                    {levels.map((level) => (
                                        <SelectItem key={level.id} value={level.id}>{level.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="md:col-span-2 space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                                <Search className="w-4 h-4" /> Recherche
                            </label>
                            <Input
                                placeholder={`Rechercher une classe ou un ${studentLabel}...`}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">Chargement des listes...</div>
            ) : filteredLists.length === 0 ? (
                <div className="text-center py-12">
                    <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <p className="text-muted-foreground">Aucune classe trouvée pour ces critères</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {filteredLists.map((classroom) => (
                        <Card key={classroom.id} className="overflow-hidden border-l-4 border-l-primary">
                            <CardHeader className="bg-muted/30">
                                <div className="flex items-center justify-between flex-wrap gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                            <School className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-lg">{classroom.name}</CardTitle>
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                                <Badge variant="secondary" className="text-[10px] h-4 uppercase">
                                                    {classroom.level?.name || "Niveau non défini"}
                                                </Badge>
                                                <span>•</span>
                                                <span>{classroom.campus?.name || "Campus principal"}</span>
                                                <span>•</span>
                                                <span className="flex items-center gap-1 font-medium text-foreground">
                                                    <Users className="w-3 h-3" />
                                                    {classroom.students.length} / {classroom.capacity || "?"} {classroom.students.length > 1 ? studentsLabel : studentLabel}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-12 text-center">N°</TableHead>
                                            <TableHead className="w-12">Photo</TableHead>
                                            <TableHead>N° Étudiant</TableHead>
                                            <TableHead>Nom Complet</TableHead>
                                            <TableHead className="hidden md:table-cell">Email</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {classroom.students.map((student, index) => (
                                            <TableRow key={student.id}>
                                                <TableCell className="text-center text-muted-foreground font-medium">
                                                    {index + 1}
                                                </TableCell>
                                                <TableCell>
                                                    <StudentAvatar
                                                        photoUrl={student.photo_url}
                                                        firstName={student.first_name}
                                                        lastName={student.last_name}
                                                        className="h-8 w-8"
                                                        fallbackClassName="text-[10px]"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="font-mono text-[10px]">
                                                        {student.registration_number || "---"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="font-medium">
                                                    {student.last_name} {student.first_name}
                                                </TableCell>
                                                <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                                                    {student.email || "-"}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {classroom.students.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground italic">
                                                    Aucun {studentLabel} inscrit dans cette classe
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ClassLists;
