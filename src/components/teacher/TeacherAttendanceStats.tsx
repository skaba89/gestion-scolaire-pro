import { Card, CardContent } from "@/components/ui/card";
import { Check, X, Clock, AlertCircle } from "lucide-react";
import { StaggerContainer, StaggerItem } from "@/components/ui/stagger-container";

interface TeacherAttendanceStatsProps {
    stats: {
        present: number;
        absent: number;
        late: number;
        excused: number;
    };
}

export const TeacherAttendanceStats = ({ stats }: TeacherAttendanceStatsProps) => {
    const statItems = [
        { label: "Présents", count: stats.present, icon: Check, color: "text-green-600", bg: "bg-green-500/10", border: "border-green-100" },
        { label: "Absents", count: stats.absent, icon: X, color: "text-red-600", bg: "bg-red-500/10", border: "border-red-100" },
        { label: "Retards", count: stats.late, icon: Clock, color: "text-orange-600", bg: "bg-orange-500/10", border: "border-orange-100" },
        { label: "Excusés", count: stats.excused, icon: AlertCircle, color: "text-blue-600", bg: "bg-blue-500/10", border: "border-blue-100" },
    ];

    return (
        <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {statItems.map((item, idx) => (
                <StaggerItem key={item.label} index={idx}>
                    <Card className={`${item.border} hover:shadow-md transition-shadow`}>
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl ${item.bg} flex items-center justify-center`}>
                                <item.icon className={`w-6 h-6 ${item.color}`} />
                            </div>
                            <div>
                                <p className={`text-2xl font-bold ${item.color}`}>{item.count}</p>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{item.label}</p>
                            </div>
                        </CardContent>
                    </Card>
                </StaggerItem>
            ))}
        </StaggerContainer>
    );
};
