import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Filter, Calendar, Activity } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";

interface AuditLogFiltersProps {
    searchQuery: string;
    actionFilter: string;
    tableFilter: string;
    startDate: string;
    endDate: string;
    uniqueActions: string[];
    uniqueTables: string[];
    tableLabels: Record<string, string>;
    onSearchChange: (value: string) => void;
    onActionChange: (value: string) => void;
    onTableChange: (value: string) => void;
    onStartDateChange: (value: string) => void;
    onEndDateChange: (value: string) => void;
    getActionInfo: (action: string) => { label: string; icon: any; color: string };
    totalEntries: number;
}

export const AuditLogFilters = ({
    searchQuery,
    actionFilter,
    tableFilter,
    startDate,
    endDate,
    uniqueActions,
    uniqueTables,
    tableLabels,
    onSearchChange,
    onActionChange,
    onTableChange,
    onStartDateChange,
    onEndDateChange,
    getActionInfo,
    totalEntries
}: AuditLogFiltersProps) => {
    return (
        <div className="space-y-6">
            <Card>
                <CardContent className="p-4">
                    <div className="flex flex-wrap items-end gap-4">
                        <div className="flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-muted-foreground" />
                            <span className="text-sm font-medium">Période:</span>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Date de début</Label>
                            <Input
                                type="date"
                                value={startDate}
                                onChange={(e) => onStartDateChange(e.target.value)}
                                className="w-40"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Date de fin</Label>
                            <Input
                                type="date"
                                value={endDate}
                                onChange={(e) => onEndDateChange(e.target.value)}
                                className="w-40"
                            />
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                onStartDateChange(format(startOfMonth(new Date()), "yyyy-MM-dd"));
                                onEndDateChange(format(endOfMonth(new Date()), "yyyy-MM-dd"));
                            }}
                        >
                            Mois actuel
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                onStartDateChange("");
                                onEndDateChange("");
                            }}
                        >
                            Tout afficher
                        </Button>
                        <div className="ml-auto text-sm text-muted-foreground">
                            {totalEntries} entrées (max 1000)
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row justify-between gap-4">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Activity className="w-5 h-5" />
                            Journal d'activité
                        </CardTitle>
                        <div className="flex flex-wrap gap-2">
                            <div className="relative w-full sm:w-48">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    placeholder="Rechercher..."
                                    value={searchQuery}
                                    onChange={(e) => onSearchChange(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                            <Select value={actionFilter} onValueChange={onActionChange}>
                                <SelectTrigger className="w-36">
                                    <Filter className="w-4 h-4 mr-2" />
                                    <SelectValue placeholder="Action" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Toutes</SelectItem>
                                    {uniqueActions.map((action) => (
                                        <SelectItem key={action} value={action}>
                                            {getActionInfo(action).label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={tableFilter} onValueChange={onTableChange}>
                                <SelectTrigger className="w-36">
                                    <SelectValue placeholder="Table" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Toutes</SelectItem>
                                    {uniqueTables.map((table) => (
                                        <SelectItem key={table} value={table}>
                                            {tableLabels[table] || table}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
            </Card>
        </div>
    );
};
