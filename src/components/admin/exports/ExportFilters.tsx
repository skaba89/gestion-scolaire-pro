import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ExportFiltersProps {
    exportType: string;
    classrooms: any[];
    terms: any[];
    selectedClassroom: string;
    selectedTerm: string;
    onClassroomChange: (value: string) => void;
    onTermChange: (value: string) => void;
}

export const ExportFilters = ({
    exportType,
    classrooms,
    terms,
    selectedClassroom,
    selectedTerm,
    onClassroomChange,
    onTermChange,
}: ExportFiltersProps) => {
    const showClassroom = ["students", "attendance", "schedule"].includes(exportType);
    const showTerm = exportType === "grades";

    if (!showClassroom && !showTerm) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Filtres</CardTitle>
                <CardDescription>Affinez votre export avec des filtres</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {showClassroom && (
                    <div>
                        <Label>Classe</Label>
                        <Select value={selectedClassroom} onValueChange={onClassroomChange}>
                            <SelectTrigger>
                                <SelectValue placeholder="Toutes les classes" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Toutes les classes</SelectItem>
                                {classrooms.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {showTerm && (
                    <div>
                        <Label>Trimestre</Label>
                        <Select value={selectedTerm} onValueChange={onTermChange}>
                            <SelectTrigger>
                                <SelectValue placeholder="Tous les trimestres" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tous les trimestres</SelectItem>
                                {terms.map((t) => (
                                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
