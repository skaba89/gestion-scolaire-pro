
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { adminQueries } from "@/queries/admin";
import { useAuth } from "@/contexts/AuthContext";

import { LibraryHeader } from "@/components/admin/library/LibraryHeader";
import { LibraryFilters } from "@/components/admin/library/LibraryFilters";
import { LibraryGrid } from "@/components/admin/library/LibraryGrid";
import { LibraryList } from "@/components/admin/library/LibraryList";

import { Loader2, ShoppingBag, Globe, Download, Import } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const RESOURCE_TYPES: Record<string, string> = {
    document: "Document",
    book: "Livre / Manuel",
    video: "Vidéo / Cours en ligne",
    link: "Lien externe",
};

export default function Marketplace() {
    const { tenant } = useTenant();
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("all");
    const [selectedType, setSelectedType] = useState("all");
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

    // Queries
    const { data: categories = [] } = useQuery({
        ...adminQueries.libraryCategories(tenant?.id || ""),
        enabled: !!tenant?.id,
    });

    const { data: resources = [], isLoading } = useQuery({
        ...adminQueries.marketplaceResources({
            search: searchQuery,
            category: selectedCategory,
            type: selectedType,
        }),
    });

    // Import mutation (clones a resource to the current tenant)
    const importMutation = useMutation({
        mutationFn: async (resource: any) => {
            const { id, created_at, updated_at, tenant_id, view_count, download_count, ...clonableData } = resource;
            const { error } = await supabase.from("library_resources").insert({
                ...clonableData,
                tenant_id: tenant!.id,
                uploaded_by: user!.id,
                is_public: false, // Imported resources are private by default
            });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-library-resources"] });
            toast.success("Ressource importée dans votre bibliothèque");
        },
        onError: (error) => toast.error("Erreur lors de l'import: " + error.message),
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <Globe className="h-8 w-8 text-primary" />
                        Marketplace Éducatif
                    </h1>
                    <p className="text-muted-foreground">
                        Découvrez et importez des ressources partagées par la communauté SchoolFlow
                    </p>
                </div>
            </div>

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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {resources.map((resource: any) => (
                    <div key={resource.id} className="bg-card border rounded-lg overflow-hidden flex flex-col group p-4 border-primary/20 bg-primary/5">
                        <div className="flex justify-between items-start mb-2">
                            <Badge variant="outline" className="bg-background">
                                {resource.tenant?.name || "Institution SchoolFlow"}
                            </Badge>
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                                <Download className="h-3 w-3" />
                                {resource.download_count || 0}
                            </div>
                        </div>
                        <h3 className="font-semibold text-lg line-clamp-1">{resource.title}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1 h-10">
                            {resource.description || "Aucune description fournie."}
                        </p>
                        <div className="mt-4 flex gap-2">
                            <Button
                                className="flex-1"
                                variant="outline"
                                onClick={() => importMutation.mutate(resource)}
                                disabled={importMutation.isPending}
                            >
                                <Import className="h-4 w-4 mr-2" />
                                Importer
                            </Button>
                            <Button
                                className="flex-1"
                                onClick={() => {
                                    window.open(resource.file_url || resource.external_url, "_blank");
                                }}
                            >
                                Voir
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            {resources.length === 0 && (
                <div className="text-center py-20 border-2 border-dashed rounded-lg bg-muted/20">
                    <ShoppingBag className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-20" />
                    <h2 className="text-xl font-semibold mb-2">Marketplace vide</h2>
                    <p className="text-muted-foreground mb-6">
                        Aucune ressource publique n'est disponible pour le moment.
                    </p>
                </div>
            )}
        </div>
    );
}
