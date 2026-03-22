import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { classroomQueries } from "@/queries/classrooms";
import { useSubjects } from "@/queries/subjects";
import { useStaff, useTeacherSchedule } from "@/features/staff/hooks/useStaff";
import { StaffProfile as TeacherProfile } from "@/features/staff/types";
import { TeacherTable } from "@/components/admin/teachers/TeacherTable";
import TeacherAssignmentsDialog from "@/components/teachers/TeacherAssignmentsDialog";

// New Modular Components
import { TeacherHeader } from "@/components/teachers/TeacherHeader";
import { TeacherStats } from "@/components/teachers/TeacherStats";
import { TeacherFormDialog } from "@/components/teachers/TeacherFormDialog";
import { TeacherViewDialog } from "@/components/teachers/TeacherViewDialog";
import { TeacherDeleteDialog } from "@/components/teachers/TeacherDeleteDialog";

const TeachersPage = () => {
  const { tenant } = useTenant();
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Dialog States
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const [selectedTeacher, setSelectedTeacher] = useState<TeacherProfile | null>(null);

  // Data Fetching
  const {
    staff: teachers,
    totalCount,
    isLoading,
    addStaff,
    isAdding,
    removeStaffRole,
    isRemoving: isDeleting
  } = useStaff({
    page: currentPage,
    pageSize,
    searchTerm: searchQuery,
    role: "TEACHER"
  });

  const { data: subjectsData = [] } = useSubjects(tenant?.id || "");
  const { data: teacherSchedule = [] } = useTeacherSchedule(selectedTeacher?.id);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // --- Handlers ---
  const handleAddTeacher = async (formData: any) => {
    try {
      await addStaff({ ...formData, role: "TEACHER" });
      setIsAddDialogOpen(false);
    } catch (error) {
      // Error handled by hook
    }
  };

  const handleDeleteTeacher = async () => {
    if (selectedTeacher) {
      try {
        await removeStaffRole({ userId: selectedTeacher.id, role: "TEACHER" });
        setIsDeleteDialogOpen(false);
      } catch (error) {
        // Error handled by hook
      }
    }
  };

  return (
    <div className="space-y-6">
      <TeacherHeader onAddClick={() => setIsAddDialogOpen(true)} />

      <TeacherStats
        totalTeachers={teachers.length}
        activeTeachers={teachers.filter(t => t.is_active).length}
        totalSubjects={subjectsData.length}
      />

      <div className="relative w-full max-w-sm ml-auto">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher un professeur..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <TeacherTable
        teachers={teachers}
        isLoading={isLoading}
        totalCount={totalCount}
        currentPage={currentPage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        searchQuery={searchQuery}
        onAddClick={() => setIsAddDialogOpen(true)}
        onAssign={(t) => {
          setSelectedTeacher(t);
          setIsAssignDialogOpen(true);
        }}
        onView={(t) => {
          setSelectedTeacher(t);
          setIsViewDialogOpen(true);
        }}
        onDelete={(t) => {
          setSelectedTeacher(t);
          setIsDeleteDialogOpen(true);
        }}
      />

      {/* Dialogs */}
      <TeacherFormDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSubmit={handleAddTeacher}
        isPending={isAdding}
      />

      <TeacherViewDialog
        open={isViewDialogOpen}
        onOpenChange={setIsViewDialogOpen}
        teacher={selectedTeacher}
        schedule={teacherSchedule}
      />

      <TeacherDeleteDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        teacher={selectedTeacher}
        onConfirm={handleDeleteTeacher}
        isPending={isDeleting}
      />

      {selectedTeacher && tenant && (
        <TeacherAssignmentsDialog
          teacher={selectedTeacher}
          tenantId={tenant.id}
          open={isAssignDialogOpen}
          onOpenChange={setIsAssignDialogOpen}
        />
      )}
    </div>
  );
};

export default TeachersPage;
