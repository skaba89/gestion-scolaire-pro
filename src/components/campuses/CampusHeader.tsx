import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CampusHeaderProps {
    onAddClick: () => void;
}

export const CampusHeader = ({ onAddClick }: CampusHeaderProps) => {
    return (
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-display font-bold text-foreground">Campus</h1>
                <p className="text-muted-foreground">Gérez les sites de votre établissement</p>
            </div>
            <Button onClick={onAddClick}>
                <Plus className="w-4 h-4 mr-2" />
                Nouveau campus
            </Button>
        </div>
    );
};
