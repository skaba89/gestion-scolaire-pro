import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useQuery } from "@tanstack/react-query";
import {
  useSemesters,
  useCreateSemester,
  useUpdateSemester,
  useDeleteSemester,
  Semester
} from "@/queries/semesters";
import { academicYearQueries } from "@/queries/academic-years";
import { Loader2 } from "lucide-react";

import { SemesterHeader } from "@/components/semesters/SemesterHeader";
import { SemesterTable } from "@/components/semesters/SemesterTable";
import { SemesterFormDialog } from "@/components/semesters/SemesterFormDialog";

const Semesters = () => {
  const { tenant } = useTenant();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSemester, setEditingSemester] = useState<Semester | null>(null);

  // Pagination and filtering state
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Queries
  const { data: semesters = [], isLoading: semestersLoading } = useSemesters(tenant?.id);
  const { data: academicYears = [] } = useQuery({
    ...academicYearQueries.all(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  // Mutations
  const createSemesterMutation = useCreateSemester();
  const updateSemesterMutation = useUpdateSemester();
  const deleteSemesterMutation = useDeleteSemester();

  // --- Handlers ---
  const handleAddClick = () => {
    setEditingSemester(null);
    setDialogOpen(true);
  };

  const handleEditClick = (semester: Semester) => {
    setEditingSemester(semester);
    setDialogOpen(true);
  };

  const handleDeleteClick = async (id: string) => {
    if (!tenant) return;
    if (confirm("Voulez-vous vraiment supprimer ce semestre ?")) {
      await deleteSemesterMutation.mutateAsync({ id, tenantId: tenant.id });
    }
  };

  const handleSubmit = async (formData: {
    name: string;
    number: number;
    start_date: string;
    end_date: string;
    is_active: boolean;
    academic_year_id: string;
    credits_required_to_advance: number | null;
  }) => {
    if (!tenant) return;

    try {
      if (editingSemester) {
        await updateSemesterMutation.mutateAsync({
          id: editingSemester.id,
          tenant_id: editingSemester.tenant_id,
          ...formData,
        });
      } else {
        await createSemesterMutation.mutateAsync({
          tenant_id: tenant.id,
          ...formData,
        });
      }
      setDialogOpen(false);
      setEditingSemester(null);
    } catch {
      // Error handled by mutation
    }
  };

  // --- Filtering ---
  const filteredSemesters = semesters.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.academic_year?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (semestersLoading) {
    return (
      <div className="flex justify-center items-center h-full p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SemesterHeader onAddClick={handleAddClick} />

      <SemesterTable
        semesters={filteredSemesters}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onEdit={handleEditClick}
        onDelete={handleDeleteClick}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
      />

      <SemesterFormDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingSemester(null); }}
        editingSemester={editingSemester}
        academicYears={academicYears}
        onSubmit={handleSubmit}
        isPending={createSemesterMutation.isPending || updateSemesterMutation.isPending}
      />
    </div>
  );
};

export default Semesters;
