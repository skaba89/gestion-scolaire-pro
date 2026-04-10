import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TermHeaderProps {
    onAddClick: () => void;
}

export const TermHeader = ({ onAddClick }: TermHeaderProps) => {
    return (
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-display font-bold text-foreground">Trimestres</h1>
                <p className="text-muted-foreground">Gérez les trimestres de chaque année scolaire</p>
            </div>
            <Button onClick={onAddClick}>
                <Plus className="w-4 h-4 mr-2" />
                Nouveau trimestre
            </Button>
        </div>
    );
};
