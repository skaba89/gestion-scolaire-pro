import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QrCode, UserCheck, UserX, Clock } from "lucide-react";

interface BadgeStatsProps {
    totalBadges: number;
    activeBadges: number;
    inactiveBadges: number;
    withoutBadge: number;
}

export function BadgeStats({
    totalBadges,
    activeBadges,
    inactiveBadges,
    withoutBadge,
}: BadgeStatsProps) {
    return (
        <div className="grid gap-4 md:grid-cols-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Total Badges</CardTitle>
                    <QrCode className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalBadges}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Badges Actifs</CardTitle>
                    <UserCheck className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-green-600">{activeBadges}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Badges Inactifs</CardTitle>
                    <UserX className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-red-600">{inactiveBadges}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Sans Badge</CardTitle>
                    <Clock className="h-4 w-4 text-yellow-600" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-yellow-600">{withoutBadge}</div>
                </CardContent>
            </Card>
        </div>
    );
}
