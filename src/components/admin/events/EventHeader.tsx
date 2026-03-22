import { Button } from "@/components/ui/button";
import { Plus, Calendar as CalendarIcon } from "lucide-react";

interface EventHeaderProps {
    onAddClick: () => void;
}

export const EventHeader = ({ onAddClick }: EventHeaderProps) => {
    return (
        <div className="flex items-center justify-between mb-6">
            <div>
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <CalendarIcon className="h-8 w-8 text-primary" />
                    Événements & Activités
                </h1>
                <p className="text-muted-foreground">Gérez les événements scolaires et activités pour toute la communauté</p>
            </div>
            <Button onClick={onAddClick}>
                <Plus className="mr-2 h-4 w-4" />
                Nouvel événement
            </Button>
        </div>
    );
};
