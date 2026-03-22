import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  academicYearQueries,
  useCreateAcademicYear,
  useUpdateAcademicYear,
  useDeleteAcademicYear,
  AcademicYear
} from "@/queries/academic-years";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantUrl } from "@/hooks/useTenantUrl";

// New Modular Components
import { AcademicYearHeader } from "@/components/academic-years/AcademicYearHeader";
import { AcademicYearTable } from "@/components/academic-years/AcademicYearTable";
import { AcademicYearFormDialog } from "@/components/academic-years/AcademicYearFormDialog";

const AcademicYears = () => {
  const { tenant } = useTenant();
  const { getTenantUrl } = useTenantUrl();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingYear, setEditingYear] = useState<AcademicYear | null>(null);

  // Queries
  const { data: years = [], isLoading: loading } = useQuery({
    ...academicYearQueries.all(tenant?.id || ""),
    enabled: !!tenant,
  });

  // Mutations
  const createMutation = useCreateAcademicYear();
  const updateMutation = useUpdateAcademicYear();
  const deleteMutation = useDeleteAcademicYear();

  const isPending = createMutation.isPending || updateMutation.isPending;

  // --- Handlers ---
  const handleAddClick = () => {
    setEditingYear(null);
    setDialogOpen(true);
  };

  const handleEditClick = (year: AcademicYear) => {
    setEditingYear(year);
    setDialogOpen(true);
  };

  const handleDeleteClick = async (id: string) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer cette année scolaire ?")) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const handleSubmit = async (formData: any) => {
    if (!tenant) return;

    try {
      const payload = {
        name: formData.name,
        start_date: formData.start_date,
        end_date: formData.end_date,
        is_current: formData.is_current,
        code: formData.code,
        tenant_id: tenant.id,
      };

      if (editingYear) {
        await updateMutation.mutateAsync({
          id: editingYear.id,
          ...payload,
        });
      } else {
        await createMutation.mutateAsync(payload);
      }

      setDialogOpen(false);
      setEditingYear(null);
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <div className="space-y-6">
      <AcademicYearHeader
        onAddClick={handleAddClick}
        manageTermsUrl={getTenantUrl("/admin/terms")}
      />

      <AcademicYearTable
        years={years}
        loading={loading}
        onEdit={handleEditClick}
        onDelete={handleDeleteClick}
      />

      <AcademicYearFormDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingYear(null); }}
        editingYear={editingYear}
        onSubmit={handleSubmit}
        isPending={isPending}
      />
    </div>
  );
};

export default AcademicYears;
