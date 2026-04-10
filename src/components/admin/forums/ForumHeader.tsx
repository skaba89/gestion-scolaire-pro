import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface ForumHeaderProps {
    onNewForum: () => void;
}

export const ForumHeader = ({ onNewForum }: ForumHeaderProps) => {
    return (
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-3xl font-bold">Forums Étudiants</h1>
                <p className="text-muted-foreground">
                    Gérez les espaces de discussion de la communauté étudiante
                </p>
            </div>
            <Button onClick={onNewForum}>
                <Plus className="h-4 w-4 mr-2" />
                Nouveau Forum
            </Button>
        </div>
    );
};
