import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useFaculties,
  useCreateFaculty,
  useUpdateFaculty,
  useDeleteFaculty,
  useBulkDeleteFaculties,
  Faculty
} from "@/queries/faculties";
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

import { FacultyHeader } from "@/components/faculties/FacultyHeader";
import { FacultyTable } from "@/components/faculties/FacultyTable";
import { FacultyFormDialog } from "@/components/faculties/FacultyFormDialog";

const Faculties = () => {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFaculty, setEditingFaculty] = useState<Faculty | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Queries
  const { data: faculties = [], isLoading } = useFaculties(tenant?.id);

  // Mutations
  const createMutation = useCreateFaculty();
  const updateMutation = useUpdateFaculty();
  const deleteMutation = useDeleteFaculty();
  const bulkDeleteMutation = useBulkDeleteFaculties();

  const isPending = createMutation.isPending || updateMutation.isPending;

  // --- Handlers ---
  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredFaculties.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredFaculties.map((f) => f.id));
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
      toast.success(`${selectedIds.length} faculté(s) supprimée(s)`);
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
      dean_id: null,
    };

    try {
      if (editingFaculty) {
        await updateMutation.mutateAsync({
          id: editingFaculty.id,
          updates: payload,
        });
        toast.success("Faculté mise à jour");
      } else {
        await createMutation.mutateAsync(payload);
        toast.success("Faculté créée");
      }
      setIsDialogOpen(false);
      setEditingFaculty(null);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleDelete = async (id: string) => {
    if (!tenant?.id) return;
    if (confirm("Voulez-vous vraiment supprimer cette faculté ?")) {
      deleteMutation.mutate({ id, tenantId: tenant.id });
    }
  };

  const handleEdit = (faculty: Faculty) => {
    setEditingFaculty(faculty);
    setIsDialogOpen(true);
  };

  const handleAddClick = () => {
    setEditingFaculty(null);
    setIsDialogOpen(true);
  };

  // --- Filtering ---
  const filteredFaculties = faculties.filter(faculty =>
    faculty.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (faculty.code || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <FacultyHeader
        selectedCount={selectedIds.length}
        onBulkDelete={() => setShowBulkDeleteConfirm(true)}
        onAddClick={handleAddClick}
      />

      <FacultyTable
        faculties={filteredFaculties}
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

      <FacultyFormDialog
        open={isDialogOpen}
        onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingFaculty(null); }}
        editingFaculty={editingFaculty}
        onSubmit={handleSubmit}
        isPending={isPending}
      />

      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer les facultés sélectionnées</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous vraiment supprimer {selectedIds.length} faculté(s) ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Faculties;
