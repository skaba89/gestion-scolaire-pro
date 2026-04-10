import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  campusQueries,
  useCreateCampus,
  useUpdateCampus,
  useDeleteCampus,
  Campus
} from "@/queries/campuses";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent } from "@/components/ui/card";

// New Modular Components
import { CampusHeader } from "@/components/campuses/CampusHeader";
import { CampusTable } from "@/components/campuses/CampusTable";
import { CampusFormDialog } from "@/components/campuses/CampusFormDialog";

const Campuses = () => {
  const { tenant } = useTenant();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCampus, setEditingCampus] = useState<Campus | null>(null);

  // Queries
  const { data: campuses = [], isLoading: loading } = useQuery({
    ...campusQueries.all(tenant?.id || ""),
    enabled: !!tenant,
  });

  // Mutations
  const createMutation = useCreateCampus();
  const updateMutation = useUpdateCampus();
  const deleteMutation = useDeleteCampus();

  const isPending = createMutation.isPending || updateMutation.isPending;

  // --- Handlers ---
  const handleAddClick = () => {
    setEditingCampus(null);
    setDialogOpen(true);
  };

  const handleEditClick = (campus: Campus) => {
    setEditingCampus(campus);
    setDialogOpen(true);
  };

  const handleDeleteClick = async (id: string) => {
    const campus = campuses.find(c => c.id === id);
    if (campus?.is_main) return; // UI handles disabling, but safety first

    if (confirm("Êtes-vous sûr de vouloir supprimer ce campus ?")) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const handleSubmit = async (formData: any) => {
    if (!tenant) return;

    try {
      const payload = {
        name: formData.name,
        address: formData.address || null,
        phone: formData.phone || null,
        is_main: formData.is_main,
        tenant_id: tenant.id,
      };

      if (editingCampus) {
        await updateMutation.mutateAsync({
          id: editingCampus.id,
          ...payload,
        });
      } else {
        await createMutation.mutateAsync(payload);
      }

      setDialogOpen(false);
      setEditingCampus(null);
    } catch (error) {
      // Error handled by mutation
    }
  };

  if (!tenant) {
    return (
      <Card className="border-warning/50 bg-warning/5">
        <CardContent className="p-6">
          <p className="text-muted-foreground">
            Veuillez d'abord configurer votre établissement.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <CampusHeader onAddClick={handleAddClick} />

      <CampusTable
        campuses={campuses}
        isLoading={loading}
        onEdit={handleEditClick}
        onDelete={handleDeleteClick}
      />

      <CampusFormDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingCampus(null); }}
        editingCampus={editingCampus}
        onSubmit={handleSubmit}
        isPending={isPending}
      />
    </div>
  );
};

export default Campuses;
