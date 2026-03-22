import { Plus, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudentExport } from "@/components/students/StudentExport";
import { StudentImport } from "@/components/students/StudentImport";

interface StudentHeaderProps {
    studentsLabel: string;
    StudentsLabel: string;
    studentLabel: string;
    getLabel: (key: string) => string;
    isAnalyzing: boolean;
    onAIAnalysis: () => void;
    onAddClick: () => void;
}

export const StudentHeader = ({
    studentsLabel,
    StudentsLabel,
    studentLabel,
    getLabel,
    isAnalyzing,
    onAIAnalysis,
    onAddClick,
}: StudentHeaderProps) => {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
                <h1 className="text-2xl font-display font-bold text-foreground">Gestion des {StudentsLabel}</h1>
                <p className="text-muted-foreground">Gérez les dossiers et inscriptions {getLabel("of_students")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={onAIAnalysis} disabled={isAnalyzing}>
                    {isAnalyzing ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                        <Sparkles className="w-4 h-4 mr-2 text-purple-600" />
                    )}
                    Analyser avec l'IA
                </Button>
                <StudentExport />
                <StudentImport />
                <Button onClick={onAddClick} className="w-full sm:w-auto">
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter un {studentLabel}
                </Button>
            </div>
        </div>
    );
};
