import { Card, CardContent } from "@/components/ui/card";
import { StaggerContainer, StaggerItem } from "@/components/ui/stagger-container";
import { LucideIcon } from "lucide-react";

interface StudentStat {
    label: string;
    value: string | number;
    suffix?: string;
    icon: LucideIcon;
    color: string;
    bgColor: string;
}

interface StudentStatsGridProps {
    stats: StudentStat[];
}

export const StudentStatsGrid = ({ stats }: StudentStatsGridProps) => {
    return (
        <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat, idx) => (
                <StaggerItem key={stat.label} index={idx}>
                    <Card className="hover:shadow-md transition-shadow h-full">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-xl ${stat.bgColor} flex items-center justify-center`}>
                                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold">
                                        {stat.value}{stat.suffix || ""}
                                    </p>
                                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </StaggerItem>
            ))}
        </StaggerContainer>
    );
};
