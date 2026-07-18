import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
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
import { Users, Building2, Layers, Search, School, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StudentAvatar } from "@/components/students/StudentAvatar";
import { referenceQueries } from "@/queries/reference-data";
import { useStudentLabel } from "@/hooks/useStudentLabel";

// jspdf (~600 kB) est chargé au clic seulement, pas avec la page.
const exportClassListPdf = async (classroom: unknown, tenantName: string) => {
    const { generateClassListPdf } = await import("@/utils/classListPdfGenerator");
    generateClassListPdf(classroom as Parameters<typeof generateClassListPdf>[0], tenantName);
};

const ClassLists = () => {
    const { t } = useTranslation();
    const { tenant } = useTenant();
    const { studentLabel, StudentLabel, studentsLabel, StudentsLabel } = useStudentLabel();
    const [selectedDept, setSelectedDept] = useState<string>("all");
    const [selectedLevel, setSelectedLevel] = useState<string>("all");
    const [searchTerm, setSearchTerm] = useState("");
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 5;

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

            const classParams: Record<string, string> = { expand: "level,campus" };
            if (selectedLevel !== "all") {
                classParams.level_id = selectedLevel;
            }

            const { data: classrooms } = await apiClient.get("/students/classes/", { params: classParams });

            let filteredClassrooms = (classrooms as any[]) || [];

            // Filter by department if needed
            if (selectedDept !== "all") {
                const { data: classDepts } = await apiClient.get("/students/class-departments/", {
                    params: { department_id: selectedDept },
                });

                const validIds = new Set((classDepts as any[])?.map((cd: any) => cd.class_id) || []);
                filteredClassrooms = filteredClassrooms.filter(c => validIds.has(c.id));
            }

            // Fetch all enrollments for these classrooms in ONE bulk query
            const classroomIds = filteredClassrooms.map(c => c.id);
            const { data: allEnrollments } = await apiClient.get("/admissions/enrollments/", {
                params: { class_ids: classroomIds.join(","), status: "ACTIVE" },
            });

            // Fetch all students for these enrollments in ONE bulk query
            const studentIds = [...new Set((allEnrollments as any[])?.map((e: any) => e.student_id) || [])];
            const { data: studentsData } = await apiClient.get("/students/", {
                params: { ids: studentIds.join(",") },
            });

            // Map students for easy lookup
            const studentMap = ((studentsData as any[]) || []).reduce((acc: Record<string, any>, student: any) => {
                acc[student.id] = student;
                return acc;
            }, {} as Record<string, any>);

            // Group students by classroom
            const fullLists = filteredClassrooms.map(classroom => {
                const classroomEnrollments = (allEnrollments as any[])?.filter((e: any) => e.class_id === classroom.id) || [];
                const students = classroomEnrollments
                    .map((e: any) => studentMap[e.student_id])
                    .filter(Boolean)
                    .sort((a: any, b: any) => a.last_name.localeCompare(b.last_name));

                return {
                    ...classroom,
                    students
                };
            });

            return fullLists;
        },
        enabled: !!tenant,
    });

    const filteredLists = useMemo(() =>
        classLists.filter(cls =>
            cls.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            cls.students.some((s: any) =>
                `${s.first_name} ${s.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
                s.registration_number?.toLowerCase().includes(searchTerm.toLowerCase())
            )
        ),
        [classLists, searchTerm]
    );

    const totalPages = Math.max(1, Math.ceil(filteredLists.length / PAGE_SIZE));
    const pagedLists = filteredLists.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-display font-bold text-foreground">{t("classLists.pageTitle")}</h1>
                    <p className="text-muted-foreground">{t("classLists.pageSubtitle", { label: studentsLabel })}</p>
                </div>
            </div>

            <Card>
                <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                                <Building2 className="w-4 h-4" /> {t("classLists.department")}
                            </label>
                            <Select value={selectedDept} onValueChange={(v) => { setSelectedDept(v); setPage(1); }}>
                                <SelectTrigger>
                                    <SelectValue placeholder={t("classLists.allDepartments")} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t("classLists.allDepartments")}</SelectItem>
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
                                <Layers className="w-4 h-4" /> {t("classLists.level")}
                            </label>
                            <Select value={selectedLevel} onValueChange={(v) => { setSelectedLevel(v); setPage(1); }}>
                                <SelectTrigger>
                                    <SelectValue placeholder={t("classLists.allLevels")} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t("classLists.allLevels")}</SelectItem>
                                    {levels.map((level) => (
                                        <SelectItem key={level.id} value={level.id}>{level.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="md:col-span-2 space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                                <Search className="w-4 h-4" /> {t("classLists.search")}
                            </label>
                            <Input
                                placeholder={t("classLists.searchPlaceholder", { label: studentLabel })}
                                value={searchTerm}
                                onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">{t("classLists.loading")}</div>
            ) : filteredLists.length === 0 ? (
                <div className="text-center py-12">
                    <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <p className="text-muted-foreground">{t("classLists.noResults")}</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {pagedLists.map((classroom) => (
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
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => exportClassListPdf(classroom, tenant?.name || "")}
                                        aria-label={t("classLists.exportPdfAria", { name: classroom.name })}
                                        disabled={classroom.students.length === 0}
                                    >
                                        <Download className="w-4 h-4 mr-2" />
                                        {t("classLists.exportPdf")}
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-12 text-center">{t("classLists.colNum")}</TableHead>
                                            <TableHead className="w-12">{t("classLists.colPhoto")}</TableHead>
                                            <TableHead>{t("classLists.colStudentNum")}</TableHead>
                                            <TableHead>{t("classLists.colFullName")}</TableHead>
                                            <TableHead className="hidden md:table-cell">{t("classLists.colEmail")}</TableHead>
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
                                                    {t("classLists.noStudentsInClass", { label: studentLabel })}
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    ))}

                    {totalPages > 1 && (
                        <div className="flex items-center justify-between pt-2">
                            <p className="text-sm text-muted-foreground">
                                {t("classLists.pageInfo", { page, totalPages, count: filteredLists.length })}
                            </p>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    aria-label={t("classLists.prevPage")}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                    aria-label={t("classLists.nextPage")}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ClassLists;
