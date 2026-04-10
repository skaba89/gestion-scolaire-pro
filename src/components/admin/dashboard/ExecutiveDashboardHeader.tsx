import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, ChevronDown, FileText, FileSpreadsheet, RefreshCw, Sparkles } from "lucide-react";

type Period = "month" | "quarter" | "year";

interface ExecutiveDashboardHeaderProps {
    period: Period;
    onPeriodChange: (period: Period) => void;
    onExportPDF: () => void;
    onExportExcel: () => void;
    onRefresh: () => void;
    onGenerateForecast: () => void;
    isGenerating: boolean;
}

export const ExecutiveDashboardHeader = ({
    period,
    onPeriodChange,
    onExportPDF,
    onExportExcel,
    onRefresh,
    onGenerateForecast,
    isGenerating
}: ExecutiveDashboardHeaderProps) => {
    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Tableau de bord Direction</h1>
                <p className="text-muted-foreground">Vue d'ensemble des indicateurs clés de performance</p>
            </div>
            <div className="flex items-center gap-2">
                <Button
                    onClick={onGenerateForecast}
                    disabled={isGenerating}
                    variant="default"
                    className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md transition-all active:scale-95"
                >
                    <Sparkles className={isGenerating ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
                    {isGenerating ? "Analyse en cours..." : "Générer Prévisions IA"}
                </Button>

                <Select value={period} onValueChange={(v) => onPeriodChange(v as Period)}>
                    <SelectTrigger className="w-[150px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="month">Ce mois</SelectItem>
                        <SelectItem value="quarter">Ce trimestre</SelectItem>
                        <SelectItem value="year">Cette année</SelectItem>
                    </SelectContent>
                </Select>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="gap-2">
                            <Download className="w-4 h-4" />
                            Exporter
                            <ChevronDown className="w-4 h-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={onExportPDF} className="gap-2">
                            <FileText className="w-4 h-4 text-red-500" />
                            Rapport PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onExportExcel} className="gap-2">
                            <FileSpreadsheet className="w-4 h-4 text-green-600" />
                            Données Excel (CSV)
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <Button onClick={onRefresh} variant="outline" size="icon" title="Actualiser">
                    <RefreshCw className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
};
