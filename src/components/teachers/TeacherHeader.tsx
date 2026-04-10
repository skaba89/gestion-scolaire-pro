import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TeacherHeaderProps {
    onAddClick: () => void;
}

export const TeacherHeader = ({ onAddClick }: TeacherHeaderProps) => {
    return (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h1 className="text-2xl font-display font-bold text-foreground">
                    Gestion des Professeurs
                </h1>
                <p className="text-muted-foreground">
                    Gérez les enseignants et leurs affectations
                </p>
            </div>
            <Button onClick={onAddClick}>
                <UserPlus className="w-4 h-4 mr-2" />
                Ajouter un professeur
            </Button>
        </div>
    );
};
