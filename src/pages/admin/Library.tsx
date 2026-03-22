import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { adminQueries } from "@/queries/admin";
import { useAuth } from "@/contexts/AuthContext";

// Modular components
import { LibraryHeader } from "@/components/admin/library/LibraryHeader";
import { LibraryStats } from "@/components/admin/library/LibraryStats";
import { LibraryFilters } from "@/components/admin/library/LibraryFilters";
import { ResourceDialog } from "@/components/admin/library/ResourceDialog";
import { CategoryDialog } from "@/components/admin/library/CategoryDialog";
import { LibraryGrid } from "@/components/admin/library/LibraryGrid";
import { LibraryList } from "@/components/admin/library/LibraryList";

import { Loader2, BookOpen } from "lucide-react";

const RESOURCE_TYPES: Record<string, string> = {
  document: "Document",
  book: "Livre / Manuel",
  video: "Vidéo / Cours en ligne",
  link: "Lien externe",
};

export default function Library() {
  const { tenant } = useTenant();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const [resourceDialogOpen, setResourceDialogOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<any | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);

  // Queries
  const { data: categories = [] } = useQuery({
    ...adminQueries.libraryCategories(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const { data: resources = [], isLoading } = useQuery({
    ...adminQueries.libraryResources(tenant?.id || "", {
      search: searchQuery,
      category: selectedCategory,
      type: selectedType,
    }),
    enabled: !!tenant?.id,
  });

  // Mutations
  const resourceMutation = useMutation({
    mutationFn: async (data: any) => {
      const resourceData = {
        ...data,
        tenant_id: tenant!.id,
        uploaded_by: user!.id,
        tags: data.tags ? data.tags.split(",").map((t: string) => t.trim()) : [],
        publication_year: data.publication_year ? parseInt(data.publication_year) : null,
      };

      if (editingResource) {
        const { error } = await supabase
          .from("library_resources")
          .update(resourceData)
          .eq("id", editingResource.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("library_resources").insert(resourceData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-library-resources"] });
      toast.success(editingResource ? "Ressource modifiée" : "Ressource ajoutée");
      setResourceDialogOpen(false);
      setEditingResource(null);
    },
    onError: () => toast.error("Une erreur est survenue"),
  });

  const deleteResourceMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("library_resources").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-library-resources"] });
      toast.success("Ressource supprimée");
    },
  });

  const categoryMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from("library_categories").insert({
        ...data,
        tenant_id: tenant!.id,
        color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-library-categories"] });
      toast.success("Catégorie ajoutée");
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("library_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-library-categories"] });
      toast.success("Catégorie supprimée");
    },
  });

  const handleEdit = (resource: any) => {
    setEditingResource(resource);
    setResourceDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <LibraryHeader
        onOpenResourceDialog={() => {
          setEditingResource(null);
          setResourceDialogOpen(true);
        }}
        onOpenCategoryDialog={() => setCategoryDialogOpen(true)}
      />

      <LibraryStats
        totalResources={resources.length}
        totalCategories={categories.length}
        featuredResources={resources.filter((r: any) => r.is_featured).length}
        totalViews={resources.reduce((acc: number, r: any) => acc + (r.views_count || 0), 0)}
      />

      <LibraryFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        selectedType={selectedType}
        onTypeChange={setSelectedType}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        categories={categories}
        resourceTypes={RESOURCE_TYPES}
      />

      {resources.length > 0 ? (
        viewMode === "grid" ? (
          <LibraryGrid
            resources={resources}
            onEdit={handleEdit}
            onDelete={(id) => deleteResourceMutation.mutate(id)}
          />
        ) : (
          <LibraryList
            resources={resources}
            onEdit={handleEdit}
            onDelete={(id) => deleteResourceMutation.mutate(id)}
          />
        )
      ) : (
        <div className="text-center py-20 border-2 border-dashed rounded-lg bg-muted/20">
          <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-20" />
          <h2 className="text-xl font-semibold mb-2">Aucune ressource trouvée</h2>
          <p className="text-muted-foreground mb-6">
            Commencez par ajouter votre premier document ou livre.
          </p>
        </div>
      )}

      <ResourceDialog
        resource={editingResource}
        isOpen={resourceDialogOpen}
        onOpenChange={(open) => {
          setResourceDialogOpen(open);
          if (!open) setEditingResource(null);
        }}
        onSubmit={(data) => resourceMutation.mutate(data)}
        isPending={resourceMutation.isPending}
        categories={categories}
        resourceTypes={RESOURCE_TYPES}
      />

      <CategoryDialog
        isOpen={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        categories={categories}
        onAdd={(data) => categoryMutation.mutate(data)}
        onDelete={(id) => deleteCategoryMutation.mutate(id)}
        isPending={categoryMutation.isPending}
      />
    </div>
  );
}
