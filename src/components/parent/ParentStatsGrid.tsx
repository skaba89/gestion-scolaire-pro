import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { StaggerContainer, StaggerItem } from "@/components/ui/stagger-container";
import { LucideIcon } from "lucide-react";

interface ParentStat {
    href: string;
    label: string;
    count: number | string | null;
    icon: LucideIcon;
    color: string;
}

interface ParentStatsGridProps {
    stats: ParentStat[];
}

export const ParentStatsGrid = ({ stats }: ParentStatsGridProps) => {
    return (
        <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((action, index) => (
                <StaggerItem key={action.href} index={index}>
                    <Link to={action.href}>
                        <Card className="hover:shadow-md transition-shadow cursor-pointer h-full border-primary/5">
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${action.color}`}>
                                        <action.icon className="w-6 h-6" />
                                    </div>
                                    <div>
                                        {action.count !== null ? (
                                            <p className="text-2xl font-bold font-display">{action.count}</p>
                                        ) : (
                                            <p className="text-2xl font-bold font-display">—</p>
                                        )}
                                        <p className="text-sm text-muted-foreground">{action.label}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                </StaggerItem>
            ))}
        </StaggerContainer>
    );
};
