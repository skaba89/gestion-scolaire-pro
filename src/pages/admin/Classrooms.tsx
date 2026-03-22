import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { School, Building2, LayoutGrid, List } from "lucide-react";

// Queries & Hooks
import {
  classroomQueries,
  useCreateClassroom,
  useUpdateClassroom,
  useDeleteClassroom,
  useRoomsCount,
  useAllRooms,
  useClassroomDepartments,
  Classroom
} from "@/queries/classrooms";
import { referenceQueries } from "@/queries/reference-data";
import { academicYearQueries } from "@/queries/academic-years";
import { usePrograms } from "@/queries/programs";

// UI Components
import { RoomsManager } from "@/components/classrooms/RoomsManager";
import { ClassDetailModal } from "@/components/classrooms/ClassDetailModal";
import { SkeletonStats } from "@/components/ui/skeleton-cards";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { Card, CardContent } from "@/components/ui/card";

// New Modular Components
import { ClassroomHeader } from "@/components/classrooms/ClassroomHeader";
import { ClassroomFilters } from "@/components/classrooms/ClassroomFilters";
import { ClassroomGrid } from "@/components/classrooms/ClassroomGrid";
import { ClassroomTable } from "@/components/classrooms/ClassroomTable";
import { ClassroomFormDialog } from "@/components/classrooms/ClassroomFormDialog";

const StatCard = ({ icon: Icon, label, value, color }: { icon: any, label: string, value: string | number, color: string }) => {
  const colors: any = {
    blue: "bg-blue-500/10 text-blue-600 dark:bg-blue-400/20",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/20",
    purple: "bg-purple-500/10 text-purple-600 dark:bg-purple-400/20",
    amber: "bg-amber-500/10 text-amber-600 dark:bg-amber-400/20",
  };

  return (
    <Card className="border-none shadow-sm hover:shadow-xl transition-all group rounded-2xl bg-background/50 backdrop-blur-sm">
      <CardContent className="p-6 flex items-center gap-5">
        <div className={`p-4 rounded-2xl ${colors[color]} group-hover:scale-110 transition-transform`}>
          <Icon className="w-7 h-7" />
        </div>
        <div>
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
          <p className="text-3xl font-black text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
};

const Classrooms = () => {
  const { tenant } = useTenant();
  const { studentLabel, studentsLabel, StudentsLabel } = useStudentLabel();

  // UI State
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedClassroom, setSelectedClassroom] = useState<Classroom | null>(null);
  const [editingClassroom, setEditingClassroom] = useState<Classroom | null>(null);

  // Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // --- Data Fetching ---
  const { data: classrooms = [], isLoading: classroomsLoading } = useQuery({
    ...classroomQueries.all(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const { data: levels = [] } = useQuery({
    ...referenceQueries.levels(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const { data: campuses = [] } = useQuery({
    ...referenceQueries.campuses(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const { data: departments = [] } = useQuery({
    ...referenceQueries.departments(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const { data: academicYears = [] } = useQuery({
    ...academicYearQueries.all(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const { data: roomsCount = 0 } = useRoomsCount(tenant?.id);
  const { data: allRooms = [] } = useAllRooms(tenant?.id);
  const { data: initialDeptIds = [] } = useClassroomDepartments(editingClassroom?.id);

  // Mutations
  const createMutation = useCreateClassroom();
  const updateMutation = useUpdateClassroom();
  const deleteMutation = useDeleteClassroom();

  // --- Handlers ---
  const handleAddClick = () => {
    setEditingClassroom(null);
    setFormDialogOpen(true);
  };

  const handleEditClick = (classroom: Classroom) => {
    setEditingClassroom(classroom);
    setFormDialogOpen(true);
  };

  const handleDeleteClick = async (id: string) => {
    if (!tenant) return;
    if (confirm("Êtes-vous sûr de vouloir supprimer cette classe ? Cette action est irréversible.")) {
      await deleteMutation.mutateAsync({ id, tenantId: tenant.id });
    }
  };

  const handleSubmit = async (formData: any, deptIds: string[], autoImport: boolean) => {
    if (!tenant) return;

    try {
      const payload = {
        name: formData.name,
        capacity: formData.capacity ? parseInt(formData.capacity) : null,
        level_id: formData.level_id || null,
        campus_id: formData.campus_id || null,
        program_id: formData.program_id || null,
        main_room_id: formData.main_room_id === "none" ? null : (formData.main_room_id || null),
        academic_year_id: formData.academic_year_id || null,
        tenant_id: tenant.id,
      };

      if (editingClassroom) {
        await updateMutation.mutateAsync({
          id: editingClassroom.id,
          tenantId: tenant.id,
          updates: payload,
          departmentIds: deptIds,
        });
      } else {
        await createMutation.mutateAsync({
          classroom: payload,
          departmentIds: deptIds,
          autoImportSubjects: autoImport,
        });
      }
      setFormDialogOpen(false);
    } catch (error) {
      console.error("Error saving classroom:", error);
    }
  };

  const handleDetailClick = (classroom: Classroom) => {
    setSelectedClassroom(classroom);
    setDetailModalOpen(true);
  };

  // --- Filtering Logic ---
  const filteredClassrooms = useMemo(() => classrooms.filter(classroom => {
    const name = classroom.name || "";
    const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLevel = selectedLevel === "all" || classroom.level_id === selectedLevel;
    return matchesSearch && matchesLevel;
  }), [classrooms, searchTerm, selectedLevel]);

  const totalPages = Math.ceil(filteredClassrooms.length / pageSize);
  const paginatedClassrooms = useMemo(() => filteredClassrooms.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  ), [filteredClassrooms, currentPage, pageSize]);

  // Stats
  const stats = useMemo(() => {
    const total = classrooms.length;
    const totalStudents = classrooms.reduce((acc, c) => acc + (Number(c.enrollment_count) || 0), 0);
    const avgPerClass = total > 0 ? Math.round(totalStudents / total) : 0;
    return { total, totalStudents, avgPerClass };
  }, [classrooms]);

  return (
    <div className="space-y-8 pb-10">
      <ClassroomHeader
        totalClasses={stats.total}
        totalStudents={stats.totalStudents}
        studentsLabel={stats.totalStudents > 1 ? studentsLabel : studentLabel}
        onAddClick={handleAddClick}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard icon={School} label="Classes" value={stats.total} color="blue" />
        <StatCard icon={Building2} label="Salles" value={roomsCount} color="purple" />
        <StatCard icon={LayoutGrid} label="Moy./classe" value={stats.avgPerClass} color="amber" />
      </div>

      <Tabs defaultValue="classes" className="space-y-6">
        <TabsList className="bg-slate-200/50 dark:bg-slate-800/50 p-1.5 rounded-2xl w-fit">
          <TabsTrigger value="classes" className="rounded-xl py-2.5 px-6 data-[state=active]:bg-background data-[state=active]:shadow-xl transition-all gap-2">
            <School className="w-4 h-4" />
            Classes
          </TabsTrigger>
          <TabsTrigger value="rooms" className="rounded-xl py-2.5 px-6 data-[state=active]:bg-background data-[state=active]:shadow-xl transition-all gap-2">
            <Building2 className="w-4 h-4" />
            Salles & Disponibilité
          </TabsTrigger>
        </TabsList>

        <TabsContent value="classes" className="space-y-6">
          <ClassroomFilters
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            selectedLevel={selectedLevel}
            onLevelChange={setSelectedLevel}
            levels={levels}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />

          {classroomsLoading ? (
            viewMode === "grid" ? <SkeletonStats count={6} /> : <TableSkeleton columns={6} rows={10} />
          ) : filteredClassrooms.length === 0 ? (
            <div className="text-center py-20 bg-background/50 rounded-3xl border-2 border-dashed border-muted">
              <p className="text-muted-foreground">Aucun résultat trouvé.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {viewMode === "grid" ? (
                <ClassroomGrid
                  classrooms={paginatedClassrooms}
                  academicYears={academicYears}
                  studentsLabel={studentsLabel}
                  studentLabel={studentLabel}
                  onEdit={handleEditClick}
                  onDelete={handleDeleteClick}
                  onDetail={handleDetailClick}
                />
              ) : (
                <ClassroomTable
                  classrooms={paginatedClassrooms}
                  onEdit={handleEditClick}
                  onDelete={handleDeleteClick}
                  onDetail={handleDetailClick}
                />
              )}

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-2">
                  <p className="text-sm text-muted-foreground">
                    Affichage de {(currentPage - 1) * pageSize + 1} à {Math.min(currentPage * pageSize, filteredClassrooms.length)} sur {filteredClassrooms.length} classes
                  </p>
                  {/* ... pagination buttons (simplified here, but could be modularized too) ... */}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rooms">
          <RoomsManager />
        </TabsContent>
      </Tabs>

      <ClassroomFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        editingClassroom={editingClassroom}
        levels={levels}
        campuses={campuses}
        departments={departments}
        academicYears={academicYears}
        allRooms={allRooms}
        initialDeptIds={initialDeptIds.map(d => d.department_id)}
        onSubmit={handleSubmit}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      <ClassDetailModal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        classroom={selectedClassroom}
      />
    </div>
  );
};

export default Classrooms;
