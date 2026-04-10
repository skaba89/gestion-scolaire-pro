import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { Assessment } from "@/features/grades/services/gradesService";

interface TeacherGradeFiltersProps {
    selectedClassroom: string;
    onClassroomChange: (value: string) => void;
    selectedAssessment: string;
    onAssessmentChange: (value: string) => void;
    assignedClassrooms: { id: string; name: string }[] | undefined;
    assessments: Assessment[] | undefined;
}

export const TeacherGradeFilters = ({
    selectedClassroom,
    onClassroomChange,
    selectedAssessment,
    onAssessmentChange,
    assignedClassrooms,
    assessments,
}: TeacherGradeFiltersProps) => {
    return (
        <Card className="border-primary/10 shadow-sm overflow-hidden">
            <div className="bg-primary/5 px-4 py-2 border-b border-primary/10">
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary/70">Sélection</p>
            </div>
            <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Classe</Label>
                        <Select value={selectedClassroom} onValueChange={onClassroomChange}>
                            <SelectTrigger className="bg-background/50 hover:bg-background transition-colors hover:border-primary/30">
                                <SelectValue placeholder="Sélectionner une classe" />
                            </SelectTrigger>
                            <SelectContent>
                                {assignedClassrooms?.map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Évaluation</Label>
                        <Select
                            value={selectedAssessment}
                            onValueChange={onAssessmentChange}
                            disabled={!selectedClassroom}
                        >
                            <SelectTrigger className="bg-background/50 hover:bg-background transition-colors hover:border-primary/30">
                                <SelectValue placeholder={selectedClassroom ? "Sélectionner une évaluation" : "Choisissez une classe d'abord"} />
                            </SelectTrigger>
                            <SelectContent>
                                {assessments?.filter(a => !selectedClassroom || a.class_id === selectedClassroom).map(a => (
                                    <SelectItem key={a.id} value={a.id}>
                                        {a.name} ({a.subjects?.name})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
