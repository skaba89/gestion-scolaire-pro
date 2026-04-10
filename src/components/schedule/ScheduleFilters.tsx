import { Building2, Layers, School } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface Department {
    id: string;
    name: string;
}

interface Level {
    id: string;
    name: string;
}

interface Classroom {
    id: string;
    name: string;
}

interface ScheduleFiltersProps {
    selectedDept: string;
    onDeptChange: (id: string) => void;
    departments: Department[];
    selectedLevel: string;
    onLevelChange: (id: string) => void;
    levels: Level[];
    selectedClassroom: string;
    onClassroomChange: (id: string) => void;
    classrooms: Classroom[];
}

export const ScheduleFilters = ({
    selectedDept,
    onDeptChange,
    departments,
    selectedLevel,
    onLevelChange,
    levels,
    selectedClassroom,
    onClassroomChange,
    classrooms,
}: ScheduleFiltersProps) => {
    return (
        <Card className="border-none shadow-sm bg-background/50 backdrop-blur-sm">
            <CardContent className="p-4 flex flex-wrap gap-6 items-center">
                <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-muted-foreground" />
                    <Select value={selectedDept} onValueChange={onDeptChange}>
                        <SelectTrigger className="w-[180px] h-10 rounded-xl border-none bg-muted/50">
                            <SelectValue placeholder="Département" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-none shadow-2xl">
                            <SelectItem value="all">Tous les dépôts</SelectItem>
                            {departments.map((dept) => (
                                <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-center gap-3">
                    <Layers className="w-5 h-5 text-muted-foreground" />
                    <Select value={selectedLevel} onValueChange={onLevelChange}>
                        <SelectTrigger className="w-[180px] h-10 rounded-xl border-none bg-muted/50">
                            <SelectValue placeholder="Niveau" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-none shadow-2xl">
                            <SelectItem value="all">Tous niveaux</SelectItem>
                            {levels.map((level) => (
                                <SelectItem key={level.id} value={level.id}>{level.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-center gap-3">
                    <School className="w-5 h-5 text-muted-foreground" />
                    <Select value={selectedClassroom} onValueChange={onClassroomChange}>
                        <SelectTrigger className="w-[200px] h-10 rounded-xl border-none bg-muted/50 font-bold">
                            <SelectValue placeholder="Sélectionner une classe" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-none shadow-2xl">
                            {classrooms.length === 0 ? (
                                <SelectItem value="none" disabled>Aucune classe</SelectItem>
                            ) : (
                                classrooms.map((classroom) => (
                                    <SelectItem key={classroom.id} value={classroom.id}>{classroom.name}</SelectItem>
                                ))
                            )}
                        </SelectContent>
                    </Select>
                </div>
            </CardContent>
        </Card>
    );
};
