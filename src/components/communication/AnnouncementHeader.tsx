import { Megaphone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AnnouncementHeaderProps {
    onAddClick: () => void;
}

export const AnnouncementHeader = ({ onAddClick }: AnnouncementHeaderProps) => {
    return (
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <Megaphone className="h-8 w-8 text-primary" />
                    Annonces & Communication
                </h1>
                <p className="text-muted-foreground">Publiez des messages à destination de votre communauté</p>
            </div>
            <Button onClick={onAddClick}>
                <Plus className="mr-2 h-4 w-4" />
                Nouvelle annonce
            </Button>
        </div>
    );
};
