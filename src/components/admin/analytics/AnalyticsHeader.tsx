import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Download } from "lucide-react";

interface AnalyticsHeaderProps {
    title: string;
    subtitle: string;
    selectedPeriod: string;
    onPeriodChange: (value: string) => void;
    onExport: () => void;
}

export const AnalyticsHeader = ({
    title,
    subtitle,
    selectedPeriod,
    onPeriodChange,
    onExport
}: AnalyticsHeaderProps) => {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
                <h1 className="text-2xl font-display font-bold text-foreground">
                    {title}
                </h1>
                <p className="text-muted-foreground">
                    {subtitle}
                </p>
            </div>
            <div className="flex gap-2">
                <Select value={selectedPeriod} onValueChange={onPeriodChange}>
                    <SelectTrigger className="w-40 bg-background shadow-sm hover:shadow transition-shadow">
                        <SelectValue placeholder="Période" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="week">Derniers 7 jours</SelectItem>
                        <SelectItem value="month">Derniers 30 jours</SelectItem>
                        <SelectItem value="year">Derniers 12 mois</SelectItem>
                    </SelectContent>
                </Select>
                <Button variant="outline" onClick={onExport} className="shadow-sm hover:shadow transition-shadow">
                    <Download className="w-4 h-4 mr-2" />
                    Exporter
                </Button>
            </div>
        </div>
    );
};
