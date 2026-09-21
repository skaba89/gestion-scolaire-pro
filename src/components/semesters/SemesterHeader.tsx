import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SemesterHeaderProps {
    onAddClick: () => void;
}

export const SemesterHeader = ({ onAddClick }: SemesterHeaderProps) => {
    return (
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-display font-bold text-foreground">Semestres</h1>
                <p className="text-muted-foreground">
                    Gérez les semestres de chaque année universitaire et leurs seuils de progression en crédits.
                </p>
            </div>
            <Button onClick={onAddClick}>
                <Plus className="w-4 h-4 mr-2" />
                Nouveau semestre
            </Button>
        </div>
    );
};
