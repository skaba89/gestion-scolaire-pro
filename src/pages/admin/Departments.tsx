import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useDepartments,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
  useBulkDeleteDepartments,
  Department
} from "@/queries/departments";
import { useTenant } from "@/contexts/TenantContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { usePrograms } from "@/queries/programs";

// New Modular Components
import { DepartmentHeader } from "@/components/departments/DepartmentHeader";
import { DepartmentTable } from "@/components/departments/DepartmentTable";
import { DepartmentFormDialog } from "@/components/departments/DepartmentFormDialog";

const Departments = () => {
  const { tenant } = useTenant();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Queries
  const { data: departments = [], isLoading } = useDepartments(tenant?.id);
  const { data: programs = [] } = usePrograms(tenant?.id);

  // Mutations
  const createMutation = useCreateDepartment();
  const updateMutation = useUpdateDepartment();
  const deleteMutation = useDeleteDepartment();
  const bulkDeleteMutation = useBulkDeleteDepartments();

  const isPending = createMutation.isPending || updateMutation.isPending;

  // --- Handlers ---
  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredDepartments.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredDepartments.map((d) => d.id));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((sid) => sid !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleBulkDelete = async () => {
    if (!tenant?.id) return;
    try {
      await bulkDeleteMutation.mutateAsync({ ids: selectedIds, tenantId: tenant.id });
      toast.success(`${selectedIds.length} départements supprimés`);
      setSelectedIds([]);
      setShowBulkDeleteConfirm(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleSubmit = async (formData: any) => {
    if (!tenant?.id) return;

    const payload = {
      tenant_id: tenant.id,
      name: formData.name,
      code: formData.code ? formData.code.toUpperCase() : null,
      description: formData.description || null,
      head_id: null,
    };

    try {
      if (editingDepartment) {
        await updateMutation.mutateAsync({
          id: editingDepartment.id,
          updates: payload,
        });
        toast.success("Département mis à jour avec succès");
      } else {
        await createMutation.mutateAsync(payload);
        toast.success("Département créé avec succès");
      }
      setIsDialogOpen(false);
      setEditingDepartment(null);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleDelete = async (id: string) => {
    if (!tenant?.id) return;
    if (confirm("Êtes-vous sûr de vouloir supprimer ce département ?")) {
      deleteMutation.mutate({ id, tenantId: tenant.id });
    }
  };

  const handleEdit = (dept: Department) => {
    setEditingDepartment(dept);
    setIsDialogOpen(true);
  };

  const handleAddClick = () => {
    setEditingDepartment(null);
    setIsDialogOpen(true);
  };

  // --- Filtering ---
  const filteredDepartments = departments.filter(dept =>
    dept.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (dept.code || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <DepartmentHeader
        selectedCount={selectedIds.length}
        onBulkDelete={() => setShowBulkDeleteConfirm(true)}
        onAddClick={handleAddClick}
      />

      <DepartmentTable
        departments={filteredDepartments}
        programs={programs}
        isLoading={isLoading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedIds={selectedIds}
        onToggleSelectAll={handleToggleSelectAll}
        onToggleSelectOne={handleToggleSelectOne}
        onEdit={handleEdit}
        onDelete={handleDelete}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
      />

      <DepartmentFormDialog
        open={isDialogOpen}
        onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingDepartment(null); }}
        editingDepartment={editingDepartment}
        onSubmit={handleSubmit}
        isPending={isPending}
      />

      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmation de suppression groupée</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer les {selectedIds.length} départements sélectionnés ?
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Departments;
