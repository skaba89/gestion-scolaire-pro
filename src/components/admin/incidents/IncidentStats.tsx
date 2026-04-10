import { Card, CardContent } from "@/components/ui/card";

interface IncidentStatsProps {
    total: number;
    open: number;
    critical: number;
    thisWeek: number;
}

export function IncidentStats({ total, open, critical, thisWeek }: IncidentStatsProps) {
    return (
        <div className="grid gap-4 md:grid-cols-4">
            <Card>
                <CardContent className="pt-6">
                    <div className="text-2xl font-bold">{total}</div>
                    <p className="text-sm text-muted-foreground">Total incidents</p>
                </CardContent>
            </Card>
            <Card className="border-orange-500/50">
                <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-orange-600">{open}</div>
                    <p className="text-sm text-muted-foreground">En cours</p>
                </CardContent>
            </Card>
            <Card className="border-red-500/50">
                <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-red-600">{critical}</div>
                    <p className="text-sm text-muted-foreground">Critiques ouverts</p>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-6">
                    <div className="text-2xl font-bold">{thisWeek}</div>
                    <p className="text-sm text-muted-foreground">Cette semaine</p>
                </CardContent>
            </Card>
        </div>
    );
}
