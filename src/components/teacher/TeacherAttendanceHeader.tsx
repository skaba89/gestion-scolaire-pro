import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

interface TeacherAttendanceHeaderProps {
    studentsLabel: string;
    showMarkAll: boolean;
    onMarkAllPresent: () => void;
}

export const TeacherAttendanceHeader = ({
    studentsLabel,
    showMarkAll,
    onMarkAllPresent
}: TeacherAttendanceHeaderProps) => {
    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h1 className="text-2xl font-display font-bold text-foreground">Gestion des Présences</h1>
                <p className="text-muted-foreground">Enregistrez les présences de vos {studentsLabel}</p>
            </div>
            {showMarkAll && (
                <Button variant="outline" onClick={onMarkAllPresent} className="shrink-0">
                    <Check className="w-4 h-4 mr-2" />
                    Tous présents
                </Button>
            )}
        </div>
    );
};
