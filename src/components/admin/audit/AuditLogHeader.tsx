import { Button } from "@/components/ui/button";
import { RefreshCw, Download, FileText } from "lucide-react";

interface AuditLogHeaderProps {
    onExportCSV: () => void;
    onExportPDF: () => void;
    onRefresh: () => void;
    isLoading: boolean;
}

export const AuditLogHeader = ({
    onExportCSV,
    onExportPDF,
    onRefresh,
    isLoading
}: AuditLogHeaderProps) => {
    return (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h1 className="text-2xl font-display font-bold text-foreground">
                    Historique des Actions
                </h1>
                <p className="text-muted-foreground text-sm">
                    Journal des connexions et actions des utilisateurs au sein de l'établissement
                </p>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onExportCSV}>
                    <Download className="w-4 h-4 mr-2" />
                    CSV
                </Button>
                <Button variant="outline" size="sm" onClick={onExportPDF}>
                    <FileText className="w-4 h-4 mr-2" />
                    PDF
                </Button>
                <Button
                    variant="default"
                    size="sm"
                    onClick={onRefresh}
                    disabled={isLoading}
                >
                    <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                    Actualiser
                </Button>
            </div>
        </div>
    );
};
