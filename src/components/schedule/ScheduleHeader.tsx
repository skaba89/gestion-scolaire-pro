import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScheduleGenerator } from "@/components/schedule/ScheduleGenerator";

interface ScheduleHeaderProps {
    onAddClick: () => void;
    selectedDept: string;
    selectedLevel: string;
    filteredClassrooms: any[];
    onGenerated: () => void;
    onClassroomGenerated: (id: string) => void;
    isAddDisabled: boolean;
}

export const ScheduleHeader = ({
    onAddClick,
    selectedDept,
    selectedLevel,
    filteredClassrooms,
    onGenerated,
    onClassroomGenerated,
    isAddDisabled,
}: ScheduleHeaderProps) => {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
                <h1 className="text-3xl font-display font-bold text-foreground">Emploi du Temps</h1>
                <p className="text-muted-foreground">Gérez le planning hebdomadaire de votre établissement</p>
            </div>
            <div className="flex items-center gap-2">
                <ScheduleGenerator
                    selectedDept={selectedDept}
                    selectedLevel={selectedLevel}
                    filteredClassrooms={filteredClassrooms}
                    onGenerated={onGenerated}
                    onClassroomGenerated={onClassroomGenerated}
                />
                <Button disabled={isAddDisabled} onClick={onAddClick} className="shadow-lg shadow-primary/20">
                    <Plus className="w-4 h-4 mr-2" />
                    Nouveau créneau
                </Button>
            </div>
        </div>
    );
};
