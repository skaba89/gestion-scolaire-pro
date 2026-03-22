import { useState, useMemo } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Layers, MapPin } from "lucide-react";
import { SubjectPreferredRoomsManager } from "@/components/subjects/SubjectPreferredRoomsManager";
import { referenceQueries } from "@/queries/reference-data";
import { classroomQueries } from "@/queries/classrooms";
import {
  useSubjects,
  useCreateSubject,
  useUpdateSubject,
  useDeleteSubject,
  useSubjectLevels,
  useAllSubjectLevels,
  useAssignSubjectToLevel,
  useClassroomDepartments,
  useClassSubjects,
  useSubjectDepartmentAssociations,
  Subject
} from "@/queries/subjects";
import { hasPermission } from "@/lib/permissions";
import { TableSkeleton } from "@/components/ui/TableSkeleton";

// New modular components
import { SubjectHeader } from "@/components/subjects/SubjectHeader";
import { SubjectFilters } from "@/components/subjects/SubjectFilters";
import { SubjectTable } from "@/components/subjects/SubjectTable";
import { SubjectFormDialog } from "@/components/subjects/SubjectFormDialog";

const Subjects = () => {
  const { tenant } = useTenant();
  const { isAdmin, hasRole, roles } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Permission Logic
  const canEdit = hasPermission(roles, "subjects:manage");

  // UI State
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [levelDialogOpen, setLevelDialogOpen] = useState(false);
  const [roomsDialogOpen, setRoomsDialogOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);

  // Filtering state
  const [selectedDept, setSelectedDept] = useState<string>("all");
  const [selectedLevel, setSelectedLevel] = useState<string>("all");
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // --- Data Fetching ---
  const { data: subjects = [], isLoading: subjectsLoading } = useSubjects(tenant?.id);
  const { data: allSubjectLevels = [] } = useAllSubjectLevels(tenant?.id);

  const { data: departments = [] } = useQuery({
    ...referenceQueries.departments(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const { data: levels = [] } = useQuery({
    ...referenceQueries.levels(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const { data: allClassrooms = [] } = useQuery({
    ...classroomQueries.all(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const { data: classroomDepts = [] } = useClassroomDepartments(tenant?.id);
  const { data: classSubjectIds = [] } = useClassSubjects(selectedClass);
  const { data: selectedLevelIds = [] } = useSubjectLevels(selectedSubject?.id);
  const { data: editingSubjectDeptIds = [] } = useSubjectDepartmentAssociations(editingSubject?.id, tenant?.id);

  // Mutations
  const createMutation = useCreateSubject();
  const updateMutation = useUpdateSubject();
  const deleteMutation = useDeleteSubject();
  const assignLevelMutation = useAssignSubjectToLevel();

  // --- Handlers ---
  const handleAddClick = () => {
    setEditingSubject(null);
    setFormDialogOpen(true);
  };

  const handleEditClick = (subject: Subject) => {
    setEditingSubject(subject);
    setFormDialogOpen(true);
  };

  const handleDeleteClick = async (id: string) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer cette matière ?")) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const handleSubmit = async (formData: any, deptIds: string[]) => {
    if (!tenant) return;

    const payload = {
      name: formData.name,
      code: formData.code || null,
      coefficient: parseFloat(formData.coefficient) || 1,
      ects: parseFloat(formData.ects) || 0,
      cm_hours: parseInt(formData.cm_hours) || 0,
      td_hours: parseInt(formData.td_hours) || 0,
      tp_hours: parseInt(formData.tp_hours) || 0,
      description: formData.description || null,
    };

    try {
      if (editingSubject) {
        await updateMutation.mutateAsync({
          id: editingSubject.id,
          tenantId: tenant.id,
          updates: payload,
          departmentIds: deptIds,
        });
      } else {
        await createMutation.mutateAsync({
          subject: { ...payload, tenant_id: tenant.id },
          departmentIds: deptIds,
        });
      }
      setFormDialogOpen(false);
    } catch (error) {
      console.error('Error saving subject:', error);
    }
  };

  // --- Filtering Logic ---
  const classesInDept = useMemo(() => {
    if (selectedDept === "all") return allClassrooms;
    const filtered = allClassrooms.filter(cls =>
      classroomDepts.some(cd => cd.class_id === cls.id && cd.department_id === selectedDept)
    );
    return filtered.length > 0 ? filtered : allClassrooms;
  }, [allClassrooms, selectedDept, classroomDepts]);

  const availableLevelIds = useMemo(() => new Set(
    selectedClass !== "all"
      ? [allClassrooms.find(c => c.id === selectedClass)?.level_id].filter(Boolean)
      : classesInDept.map(c => c.level_id).filter(Boolean)
  ), [selectedClass, allClassrooms, classesInDept]);

  const filteredLevels = useMemo(() =>
    levels.filter(lvl => availableLevelIds.has(lvl.id))
    , [levels, availableLevelIds]);

  const finalFilteredClasses = useMemo(() =>
    classesInDept.filter(cls => selectedLevel === "all" || cls.level_id === selectedLevel)
    , [classesInDept, selectedLevel]);

  const filteredSubjects = useMemo(() => {
    return subjects.filter(subject => {
      // Text search
      const matchesSearch = subject.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (subject.code?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
      if (!matchesSearch) return false;

      // Department Filter
      if (selectedDept !== "all") {
        if (subject.department_id && subject.department_id !== selectedDept) return false;
      }

      // Level filter based on selection
      let activeLevelIds: string[] = [];
      if (selectedClass !== "all") {
        const cls = allClassrooms.find(c => c.id === selectedClass);
        if (cls?.level_id) activeLevelIds = [cls.level_id];
      } else if (selectedLevel !== "all") {
        activeLevelIds = [selectedLevel];
      }

      if (activeLevelIds.length > 0) {
        const subjectLevels = allSubjectLevels.filter(sl => sl.subject_id === subject.id).map(sl => sl.level_id);
        const matchesLevel = activeLevelIds.some(id => subjectLevels.includes(id));
        if (!matchesLevel) return false;
      }

      // Class Filter
      if (selectedClass !== "all") {
        if (!classSubjectIds.includes(subject.id)) return false;
      }

      return true;
    });
  }, [subjects, searchTerm, selectedDept, selectedLevel, selectedClass, allClassrooms, allSubjectLevels, classSubjectIds]);

  const clearFilters = () => {
    setSelectedDept("all");
    setSelectedLevel("all");
    setSelectedClass("all");
    setSearchTerm("");
  };

  const toggleLevelAssignment = async (levelId: string) => {
    if (!selectedSubject || !tenant) return;
    const isAssigned = selectedLevelIds.includes(levelId);
    await assignLevelMutation.mutateAsync({
      subjectId: selectedSubject.id,
      levelId,
      assign: !isAssigned,
      tenantId: tenant.id,
    });
  };

  if (subjectsLoading) {
    return (
      <div className="p-8">
        <TableSkeleton columns={6} rows={10} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SubjectHeader onAddClick={handleAddClick} canEdit={canEdit} />

      <SubjectFilters
        departments={departments}
        levels={selectedDept === "all" ? levels : filteredLevels}
        classrooms={selectedLevel === "all" && selectedDept === "all" ? allClassrooms : finalFilteredClasses}
        selectedDept={selectedDept}
        selectedLevel={selectedLevel}
        selectedClass={selectedClass}
        searchTerm={searchTerm}
        onDeptChange={(val) => { setSelectedDept(val); setSelectedLevel("all"); setSelectedClass("all"); }}
        onLevelChange={(val) => { setSelectedLevel(val); setSelectedClass("all"); }}
        onClassChange={setSelectedClass}
        onSearchChange={(val) => { setSearchTerm(val); setCurrentPage(1); }}
        onClearFilters={clearFilters}
      />

      <SubjectTable
        subjects={filteredSubjects}
        onEdit={handleEditClick}
        onDelete={handleDeleteClick}
        onAssignLevel={(s) => { setSelectedSubject(s); setLevelDialogOpen(true); }}
        onAssignRooms={(s) => { setSelectedSubject(s); setRoomsDialogOpen(true); }}
        currentPage={currentPage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        onClearFilters={clearFilters}
        hasFilters={!!(searchTerm || selectedDept !== "all" || selectedLevel !== "all" || selectedClass !== "all")}
        canEdit={canEdit}
      />

      <SubjectFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        editingSubject={editingSubject}
        departments={departments}
        tenantId={tenant?.id || ""}
        initialDeptIds={editingSubjectDeptIds}
        onSubmit={handleSubmit}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      {/* Level Assignment Dialog */}
      <Dialog open={levelDialogOpen} onOpenChange={setLevelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Niveaux - {selectedSubject?.name}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">Sélectionnez les niveaux où cette matière est enseignée</p>
            <div className="space-y-3">
              {levels.map((level) => {
                const isAssigned = selectedLevelIds.includes(level.id);
                return (
                  <div
                    key={level.id}
                    className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted cursor-pointer"
                    onClick={() => toggleLevelAssignment(level.id)}
                  >
                    <Checkbox checked={isAssigned} disabled={assignLevelMutation.isPending} />
                    <span className="font-medium">{level.name}</span>
                    {assignLevelMutation.isPending && <Loader2 className="h-3 w-3 animate-spin ml-auto opacity-50" />}
                  </div>
                );
              })}
              {levels.length === 0 && <p className="text-center py-4 text-muted-foreground">Aucun niveau créé.</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rooms Assignment Dialog */}
      <Dialog open={roomsDialogOpen} onOpenChange={setRoomsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salles préférentielles - {selectedSubject?.name}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {selectedSubject && tenant && (
              <SubjectPreferredRoomsManager subjectId={selectedSubject.id} tenantId={tenant.id} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Subjects;
