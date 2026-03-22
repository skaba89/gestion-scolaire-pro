import { useState } from "react";
import { StudentRisk } from "@/types/ai";
import { StudentRiskCard } from "@/components/admin/ai/StudentRiskCard";
import { RiskLevelBadge } from "@/components/admin/ai/RiskLevelBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Award } from "lucide-react";

interface StudentRiskListProps {
    studentRisks: StudentRisk[];
    classrooms: { id: string; name: string }[];
}

export function StudentRiskList({ studentRisks, classrooms }: StudentRiskListProps) {
    const [selectedClassroom, setSelectedClassroom] = useState<string>("all");

    const filteredRisks = studentRisks.filter((s) => {
        if (selectedClassroom === "all") return true;
        // Note: The hook returns classroom name, but logic might need ID.
        // Assuming for now simple filtering. 
        // Ideally the hook should return classroom ID in student object.
        // Let's rely on the hook's returned raw data structure which had enrolled classroom.
        // But our types simplified it to string. 
        // We'll filter by string matching for now or update types.
        // UPDATE: Ideally we should use the classroom name for filtering if ID isn't available easily
        // or pass the ID in the type.
        // For this refactor, let's keep it simple:
        return true; // Placeholder until we align types better or use client-side filtering by name
    }).filter((s) => {
        if (selectedClassroom === "all") return true;
        return s.classroom === classrooms.find(c => c.id === selectedClassroom)?.name;
    });

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4">
                <div className="flex-1">
                    <Label>Filtrer par classe</Label>
                    <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
                        <SelectTrigger className="w-64">
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
                <div className="flex gap-2 text-sm">
                    <RiskLevelBadge level="high" className="flex items-center gap-1">
                        {studentRisks.filter((s) => s.riskLevel === "high").length}
                    </RiskLevelBadge>
                    <RiskLevelBadge level="medium" className="flex items-center gap-1">
                        {studentRisks.filter((s) => s.riskLevel === "medium").length}
                    </RiskLevelBadge>
                    <RiskLevelBadge level="low" className="flex items-center gap-1">
                        {studentRisks.filter((s) => s.riskLevel === "low").length}
                    </RiskLevelBadge>
                </div>
            </div>

            <div className="grid gap-4">
                {filteredRisks.filter((s) => s.riskLevel !== "low").slice(0, 10).map((student) => (
                    <StudentRiskCard key={student.id} student={student} />
                ))}
                {filteredRisks.filter((s) => s.riskLevel !== "low").length === 0 && (
                    <Card className="border-dashed">
                        <CardContent className="py-12 text-center">
                            <Award className="h-12 w-12 mx-auto mb-4 text-green-500" />
                            <h3 className="font-medium text-lg">Excellentes performances !</h3>
                            <p className="text-muted-foreground">Aucun étudiant à risque détecté</p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
