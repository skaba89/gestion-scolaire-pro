import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import {
  useLevels,
  useCreateLevel,
  useUpdateLevel,
  useDeleteLevel,
  useReorderLevels,
  Level
} from "@/queries/levels";

// New Modular Components
import { LevelHeader } from "@/components/levels/LevelHeader";
import { LevelTable } from "@/components/levels/LevelTable";
import { LevelFormDialog } from "@/components/levels/LevelFormDialog";

const Levels = () => {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLevel, setEditingLevel] = useState<Level | null>(null);

  // Pagination and filtering state
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Queries
  const { data: levels = [], isLoading: levelsLoading } = useLevels(tenant?.id);

  // Mutations
  const createLevelMutation = useCreateLevel();
  const updateLevelMutation = useUpdateLevel();
  const deleteLevelMutation = useDeleteLevel();
  const reorderLevelsMutation = useReorderLevels();

  // --- Handlers ---
  const handleAddClick = () => {
    setEditingLevel(null);
    setDialogOpen(true);
  };

  const handleEditClick = (level: Level) => {
    setEditingLevel(level);
    setDialogOpen(true);
  };

  const handleDeleteClick = async (id: string) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer ce niveau ?")) {
      await deleteLevelMutation.mutateAsync(id);
    }
  };

  const handleSubmit = async (formData: any) => {
    if (!tenant || !formData.name) {
      toast({ title: "Erreur", description: "Veuillez entrer un nom", variant: "destructive" });
      return;
    }

    try {
      if (editingLevel) {
        await updateLevelMutation.mutateAsync({
          id: editingLevel.id,
          name: formData.name,
          code: formData.code,
          label: formData.label,
          order_index: formData.order_index,
        });
      } else {
        await createLevelMutation.mutateAsync({
          tenant_id: tenant.id,
          name: formData.name,
          code: formData.code,
          label: formData.label,
          order_index: levels.length,
        });
      }

      setDialogOpen(false);
      setEditingLevel(null);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleMove = async (level: Level, direction: "up" | "down") => {
    const currentIndex = levels.findIndex((l) => l.id === level.id);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= levels.length) return;

    const targetLevel = levels[targetIndex];

    await reorderLevelsMutation.mutateAsync({
      items: [
        { id: level.id, order_index: targetIndex },
        { id: targetLevel.id, order_index: currentIndex }
      ]
    });
  };

  // --- Filtering ---
  const filteredLevels = levels.filter(l =>
    l.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (levelsLoading) {
    return (
      <div className="flex justify-center items-center h-full p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <LevelHeader onAddClick={handleAddClick} />

      <LevelTable
        levels={filteredLevels}
        totalLevels={levels.length}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onEdit={handleEditClick}
        onDelete={handleDeleteClick}
        onMove={handleMove}
        isReordering={reorderLevelsMutation.isPending}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
      />

      <LevelFormDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingLevel(null); }}
        editingLevel={editingLevel}
        onSubmit={handleSubmit}
        isPending={createLevelMutation.isPending || updateLevelMutation.isPending}
        nextOrderIndex={levels.length}
      />
    </div>
  );
};

export default Levels;
