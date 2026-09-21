import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FacultyHeaderProps {
    selectedCount: number;
    onBulkDelete: () => void;
    onAddClick: () => void;
}

export const FacultyHeader = ({
    selectedCount,
    onBulkDelete,
    onAddClick,
}: FacultyHeaderProps) => {
    return (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Gestion des Facultés</h1>
                <p className="text-muted-foreground">
                    Configurez les facultés de votre établissement (structure LMD, au-dessus des départements).
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
                    Ajouter une Faculté
                </Button>
            </div>
        </div>
    );
};
