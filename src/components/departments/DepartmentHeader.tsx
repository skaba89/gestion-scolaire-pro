import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DepartmentHeaderProps {
    selectedCount: number;
    onBulkDelete: () => void;
    onAddClick: () => void;
}

export const DepartmentHeader = ({
    selectedCount,
    onBulkDelete,
    onAddClick,
}: DepartmentHeaderProps) => {
    return (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Gestion des Départements</h1>
                <p className="text-muted-foreground">
                    Configurez les départements et filières de votre établissement (Université).
                </p>
            </div>
            <div className="flex gap-2">
                {selectedCount > 0 && (
                    <Button variant="destructive" onClick={onBulkDelete}>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Supprimer ({selectedCount})
                    </Button>
                )}
                <Button onClick={onAddClick}>
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter un Département
                </Button>
            </div>
        </div>
    );
};
