import { FileText, Plus } from "lucide-react";
import { useTerminology } from "@/hooks/useTerminology";
import { Button } from "@/components/ui/button";

interface GradeHeaderProps {
    onAddClick: () => void;
    onGenerateBulletins: () => void;
}

export const GradeHeader = ({ onAddClick, onGenerateBulletins }: GradeHeaderProps) => {
    const { gradeLabel, termLabel } = useTerminology();
    return (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
                <h1 className="text-2xl font-display font-bold text-foreground">{gradeLabel}s & {termLabel}s</h1>
                <p className="text-muted-foreground">Gérez les évaluations et documents académiques</p>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" onClick={onGenerateBulletins}>
                    <FileText className="w-4 h-4 mr-2" />
                    Générer {termLabel}s
                </Button>
                <Button onClick={onAddClick}>
                    <Plus className="w-4 h-4 mr-2" />
                    Nouvelle Évaluation
                </Button>
            </div>
        </div>
    );
};
