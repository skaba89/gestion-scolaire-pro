import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface Classroom {
    id: string;
    name: string;
}

interface GradeFiltersProps {
    searchTerm: string;
    onSearchChange: (value: string) => void;
    selectedClassroom: string;
    onClassroomChange: (value: string) => void;
    classrooms: Classroom[];
}

export const GradeFilters = ({
    searchTerm,
    onSearchChange,
    selectedClassroom,
    onClassroomChange,
    classrooms,
}: GradeFiltersProps) => {
    return (
        <Card>
            <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Rechercher une évaluation..."
                            value={searchTerm}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                    <Select value={selectedClassroom} onValueChange={onClassroomChange}>
                        <SelectTrigger className="w-full sm:w-48">
                            <SelectValue placeholder="Toutes les classes" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Toutes les classes</SelectItem>
                            {classrooms.map((classroom) => (
                                <SelectItem key={classroom.id} value={classroom.id}>
                                    {classroom.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </CardContent>
        </Card>
    );
};
