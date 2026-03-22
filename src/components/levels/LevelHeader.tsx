import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LevelHeaderProps {
    onAddClick: () => void;
}

export const LevelHeader = ({ onAddClick }: LevelHeaderProps) => {
    return (
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-display font-bold text-foreground">Niveaux</h1>
                <p className="text-muted-foreground">Gérez les niveaux d'enseignement</p>
            </div>
            <Button onClick={onAddClick}>
                <Plus className="w-4 h-4 mr-2" />
                Nouveau niveau
            </Button>
        </div>
    );
};
