import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import { RiskLevelBadge } from "./RiskLevelBadge";

interface StudentRisk {
    id: string;
    name: string;
    classroom: string;
    riskLevel: "high" | "medium" | "low";
    riskScore: number;
    factors: string[];
    avgGrade: number;
    attendanceRate: number;
}

interface StudentRiskCardProps {
    student: StudentRisk;
}

export const StudentRiskCard = ({ student }: StudentRiskCardProps) => {
    return (
        <Card key={student.id}>
            <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-4">
                <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${student.riskLevel === "high" ? "bg-red-500/10" :
                            student.riskLevel === "medium" ? "bg-yellow-500/10" : "bg-green-500/10"
                        }`}>
                        <Users className={`h-6 w-6 ${student.riskLevel === "high" ? "text-red-600" :
                                student.riskLevel === "medium" ? "text-yellow-600" : "text-green-600"
                            }`} />
                    </div>
                    <div>
                        <p className="font-medium">{student.name}</p>
                        <p className="text-sm text-muted-foreground">{student.classroom}</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 sm:gap-6 w-full sm:w-auto">
                    <div className="text-center min-w-[60px]">
                        <p className="text-lg font-semibold">{student.avgGrade}%</p>
                        <p className="text-xs text-muted-foreground">Moyenne</p>
                    </div>
                    <div className="text-center min-w-[60px]">
                        <p className="text-lg font-semibold">{student.attendanceRate}%</p>
                        <p className="text-xs text-muted-foreground">Présence</p>
                    </div>
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {student.factors.map((factor, idx) => (
                            <Badge key={idx} variant="outline" className="text-[10px] h-5 px-1.5">
                                {factor}
                            </Badge>
                        ))}
                    </div>
                    <RiskLevelBadge level={student.riskLevel} className="ml-auto sm:ml-0" />
                </div>
            </CardContent>
        </Card>
    );
};
