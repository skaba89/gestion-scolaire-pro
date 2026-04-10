import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface SubjectHeaderProps {
    onAddClick: () => void;
    canEdit?: boolean;
}

export const SubjectHeader = ({ onAddClick, canEdit = false }: SubjectHeaderProps) => {
    return (
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-display font-bold text-foreground">Matières</h1>
                <p className="text-muted-foreground">Gérez le catalogue des matières enseignées</p>
            </div>
            {canEdit && (
                <Button onClick={onAddClick}>
                    <Plus className="w-4 h-4 mr-2" />
                    Nouvelle matière
                </Button>
            )}
        </div>
    );
};
