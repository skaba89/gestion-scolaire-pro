import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useQuery } from "@tanstack/react-query";
import {
  useTerms,
  useCreateTerm,
  useUpdateTerm,
  useDeleteTerm,
  Term
} from "@/queries/terms";
import { academicYearQueries } from "@/queries/academic-years";
import { Loader2 } from "lucide-react";

// New Modular Components
import { TermHeader } from "@/components/terms/TermHeader";
import { TermTable } from "@/components/terms/TermTable";
import { TermFormDialog } from "@/components/terms/TermFormDialog";

const Terms = () => {
  const { tenant } = useTenant();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTerm, setEditingTerm] = useState<Term | null>(null);

  // Pagination and filtering state
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Queries
  const { data: terms = [], isLoading: termsLoading } = useTerms(tenant?.id);
  const { data: academicYears = [] } = useQuery({
    ...academicYearQueries.all(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  // Mutations
  const createTermMutation = useCreateTerm();
  const updateTermMutation = useUpdateTerm();
  const deleteTermMutation = useDeleteTerm();

  // --- Handlers ---
  const handleAddClick = () => {
    setEditingTerm(null);
    setDialogOpen(true);
  };

  const handleEditClick = (term: Term) => {
    setEditingTerm(term);
    setDialogOpen(true);
  };

  const handleDeleteClick = async (id: string) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer ce trimestre ?")) {
      await deleteTermMutation.mutateAsync(id);
    }
  };

  const handleSubmit = async (formData: any) => {
    if (!tenant) return;

    try {
      if (editingTerm) {
        await updateTermMutation.mutateAsync({
          id: editingTerm.id,
          tenant_id: editingTerm.tenant_id,
          ...formData,
        });
      } else {
        await createTermMutation.mutateAsync({
          tenant_id: tenant.id,
          ...formData,
        });
      }
      setDialogOpen(false);
      setEditingTerm(null);
    } catch (error) {
      // Error handled by mutation
    }
  };

  // --- Filtering ---
  const filteredTerms = terms.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.academic_year?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (termsLoading) {
    return (
      <div className="flex justify-center items-center h-full p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TermHeader onAddClick={handleAddClick} />

      <TermTable
        terms={filteredTerms}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onEdit={handleEditClick}
        onDelete={handleDeleteClick}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
      />

      <TermFormDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingTerm(null); }}
        editingTerm={editingTerm}
        academicYears={academicYears}
        onSubmit={handleSubmit}
        isPending={createTermMutation.isPending || updateTermMutation.isPending}
      />
    </div>
  );
};

export default Terms;
