import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { StaggerContainer, StaggerItem } from "@/components/ui/stagger-container";
import { LucideIcon } from "lucide-react";

interface QuickAction {
    href: string;
    label: string;
    icon: LucideIcon;
    count: number;
}

interface TeacherQuickActionsProps {
    actions: QuickAction[];
}

export const TeacherQuickActions = ({ actions }: TeacherQuickActionsProps) => {
    return (
        <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {actions.map((action, idx) => (
                <StaggerItem key={action.href} index={idx}>
                    <Link to={action.href}>
                        <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                                        <action.icon className="w-6 h-6 text-primary" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold">{action.count}</p>
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
