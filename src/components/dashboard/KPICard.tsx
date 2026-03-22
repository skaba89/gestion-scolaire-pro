import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, Target } from "lucide-react";
import { cn } from "@/lib/utils";

export type KPIStatus = "good" | "warning" | "critical";
export type TrendDirection = "up" | "down" | "stable";

export interface KPICardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    trend?: {
        value: number;
        direction: TrendDirection;
        label?: string;
    };
    target?: number;
    status?: KPIStatus;
    icon?: React.ReactNode;
    className?: string;
}

export const KPICard = ({
    title,
    value,
    subtitle,
    trend,
    target,
    status = "good",
    icon,
    className,
}: KPICardProps) => {
    const statusColors = {
        good: "text-green-600 bg-green-50 border-green-200",
        warning: "text-yellow-600 bg-yellow-50 border-yellow-200",
        critical: "text-red-600 bg-red-50 border-red-200",
    };

    const trendColors = {
        up: "text-green-600",
        down: "text-red-600",
        stable: "text-gray-600",
    };

    const TrendIcon = trend?.direction === "up"
        ? TrendingUp
        : trend?.direction === "down"
            ? TrendingDown
            : Minus;

    return (
        <Card className={cn("transition-all hover:shadow-lg", className)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                    {title}
                </CardTitle>
                {icon && (
                    <div className={cn("p-2 rounded-lg", statusColors[status])}>
                        {icon}
                    </div>
                )}
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    {/* Main Value */}
                    <div className="flex items-baseline justify-between">
                        <div className="text-3xl font-bold">{value}</div>
                        {trend && (
                            <div className={cn("flex items-center gap-1 text-sm font-medium", trendColors[trend.direction])}>
                                <TrendIcon className="w-4 h-4" />
                                <span>{trend.value > 0 ? "+" : ""}{trend.value}%</span>
                            </div>
                        )}
                    </div>

                    {/* Subtitle or Trend Label */}
                    {(subtitle || trend?.label) && (
                        <p className="text-xs text-muted-foreground">
                            {trend?.label || subtitle}
                        </p>
                    )}

                    {/* Target Progress Bar */}
                    {target !== undefined && typeof value === "number" && (
                        <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Objectif</span>
                                <span className="font-medium">{target}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                    className={cn(
                                        "h-2 rounded-full transition-all",
                                        value >= target ? "bg-green-500" :
                                            value >= target * 0.9 ? "bg-yellow-500" :
                                                "bg-red-500"
                                    )}
                                    style={{ width: `${Math.min((value / target) * 100, 100)}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Status Badge */}
                    {status !== "good" && (
                        <div className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium", statusColors[status])}>
                            {status === "warning" && <Target className="w-3 h-3" />}
                            {status === "critical" && <Target className="w-3 h-3" />}
                            {status === "warning" ? "Attention requise" : "Action urgente"}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};
