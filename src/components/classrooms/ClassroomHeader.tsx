import { School, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ClassroomHeaderProps {
    totalClasses: number;
    totalStudents: number;
    studentsLabel: string;
    onAddClick: () => void;
}

export const ClassroomHeader = ({
    totalClasses,
    totalStudents,
    studentsLabel,
    onAddClick,
}: ClassroomHeaderProps) => {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white shadow-colored">
                    <School className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-3xl font-display font-bold text-foreground">Gestion des classes</h1>
                    <p className="text-muted-foreground font-medium">
                        {totalClasses} classe(s) • {totalStudents} {studentsLabel}
                    </p>
                </div>
            </div>
            <Button
                onClick={onAddClick}
                className="rounded-xl px-6 h-12 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all"
            >
                <Plus className="w-5 h-5 mr-2" />
                Nouvelle classe
            </Button>
        </div>
    );
};
