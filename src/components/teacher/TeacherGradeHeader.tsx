import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TeacherGradeHeaderProps {
    onNewAssessmentClick: () => void;
}

export const TeacherGradeHeader = ({ onNewAssessmentClick }: TeacherGradeHeaderProps) => {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
                <h1 className="text-2xl font-display font-bold text-foreground">Gestion des Notes</h1>
                <p className="text-muted-foreground">Créez des évaluations et saisissez les notes</p>
            </div>
            <Button
                onClick={onNewAssessmentClick}
                className="shrink-0 bg-primary hover:bg-primary/90 transition-all shadow-md"
            >
                <Plus className="w-4 h-4 mr-2" />
                Nouvelle Évaluation
            </Button>
        </div>
    );
};
