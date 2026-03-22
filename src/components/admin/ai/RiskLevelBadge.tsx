import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface RiskLevelBadgeProps {
    level: "high" | "medium" | "low";
    className?: string;
    children?: React.ReactNode;
}

export const RiskLevelBadge = ({ level, className, children }: RiskLevelBadgeProps) => {
    const riskLevelColors = {
        high: "bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/20",
        medium: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20 hover:bg-yellow-500/20",
        low: "bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20",
    };

    const labels = {
        high: "Risque élevé",
        medium: "Risque moyen",
        low: "Risque faible",
    };

    return (
        <Badge variant="outline" className={cn(riskLevelColors[level], className)}>
            {children || labels[level]}
        </Badge>
    );
};
