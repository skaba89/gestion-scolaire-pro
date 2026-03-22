import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { adminQueries } from "@/queries/admin";
import { ForumHeader } from "@/components/admin/forums/ForumHeader";
import { ForumStats } from "@/components/admin/forums/ForumStats";
import { ForumList } from "@/components/admin/forums/ForumList";
import { ForumDialog } from "@/components/admin/forums/ForumDialog";
import { forumCategories } from "@/components/admin/forums/constants";

export default function Forums() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedForum, setSelectedForum] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "general",
    is_active: true,
  });

  // Queries
  const { data: forums, isLoading } = useQuery({
    ...adminQueries.adminForums(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const { data: postCounts } = useQuery({
    ...adminQueries.adminForumPostCounts(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  // Mutations
  const saveMutation = useMutation({
    mutationFn: (data: any) => adminQueries.saveForum(tenant?.id || "", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-forums"] });
      toast.success(selectedForum ? "Forum mis à jour" : "Forum créé");
      resetForm();
    },
    onError: () => {
      toast.error("Erreur lors de l'enregistrement");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: adminQueries.deleteForum,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-forums"] });
      toast.success("Forum supprimé");
    },
    onError: () => {
      toast.error("Erreur lors de la suppression");
    },
  });

  const resetForm = () => {
    setFormData({ title: "", description: "", category: "general", is_active: true });
    setSelectedForum(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (forum: any) => {
    setSelectedForum(forum);
    setFormData({
      title: forum.title,
      description: forum.description || "",
      category: forum.category || "general",
      is_active: forum.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.title) {
      toast.error("Le titre est requis");
      return;
    }
    saveMutation.mutate({ ...formData, id: selectedForum?.id });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">Chargement...</div>;
  }

  return (
    <div className="space-y-6">
      <ForumHeader onNewForum={() => { resetForm(); setIsDialogOpen(true); }} />

      <ForumStats
        activeCount={forums?.filter((f) => f.is_active).length || 0}
        totalPosts={Object.values(postCounts || {}).reduce((a, b) => a + b, 0)}
        categoryCount={forumCategories.length}
        inactiveCount={forums?.filter((f) => !f.is_active).length || 0}
      />

      <ForumList
        forums={forums || []}
        postCounts={postCounts || {}}
        onEdit={handleEdit}
        onDelete={(id) => deleteMutation.mutate(id)}
        onNewForum={() => setIsDialogOpen(true)}
      />

      <ForumDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        selectedForum={selectedForum}
        formData={formData}
        setFormData={setFormData}
        onSubmit={handleSubmit}
        onClose={resetForm}
        isSubmitting={saveMutation.isPending}
      />
    </div>
  );
}
