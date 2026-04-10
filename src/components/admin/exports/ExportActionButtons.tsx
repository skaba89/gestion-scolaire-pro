import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, FileJson, FileText, Download } from "lucide-react";

interface ExportActionButtonsProps {
    isExporting: boolean;
    selectedFieldsCount: number;
    onExport: (format: "csv" | "pdf" | "json") => void;
    label: string;
}

export const ExportActionButtons = ({
    isExporting,
    selectedFieldsCount,
    onExport,
    label
}: ExportActionButtonsProps) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Format d'export</CardTitle>
                <CardDescription>Choisissez le format de votre fichier</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid sm:grid-cols-3 gap-4">
                    <Button
                        variant="outline"
                        className="h-auto py-6 flex flex-col items-center gap-2"
                        onClick={() => onExport("csv")}
                        disabled={isExporting || selectedFieldsCount === 0}
                    >
                        <FileSpreadsheet className="h-8 w-8 text-green-600" />
                        <div className="text-center">
                            <p className="font-medium">Export CSV</p>
                            <p className="text-xs text-muted-foreground">Excel, Google Sheets</p>
                        </div>
                    </Button>

                    <Button
                        variant="outline"
                        className="h-auto py-6 flex flex-col items-center gap-2"
                        onClick={() => onExport("json")}
                        disabled={isExporting || selectedFieldsCount === 0}
                    >
                        <FileJson className="h-8 w-8 text-blue-600" />
                        <div className="text-center">
                            <p className="font-medium">Export JSON</p>
                            <p className="text-xs text-muted-foreground">APIs, développeurs</p>
                        </div>
                    </Button>

                    <Button
                        variant="outline"
                        className="h-auto py-6 flex flex-col items-center gap-2"
                        onClick={() => onExport("pdf")}
                        disabled={isExporting || selectedFieldsCount === 0}
                    >
                        <FileText className="h-8 w-8 text-red-600" />
                        <div className="text-center">
                            <p className="font-medium">Export PDF</p>
                            <p className="text-xs text-muted-foreground">Impression</p>
                        </div>
                    </Button>
                </div>

                <div className="mt-6 border-t pt-6">
                    <div className="flex flex-col items-center py-4 border-2 border-dashed rounded-lg bg-muted/30">
                        <Download className="h-10 w-10 mb-2 text-muted-foreground/40" />
                        <h3 className="font-medium mb-1">Prêt à exporter</h3>
                        <p className="text-xs text-muted-foreground">
                            {selectedFieldsCount} colonne(s) sélectionnée(s) pour l'export {label}
                        </p>
                    </div>
                </div>

                {selectedFieldsCount === 0 && (
                    <p className="text-sm text-destructive mt-4 text-center">
                        Veuillez sélectionner au moins une colonne à exporter
                    </p>
                )}
            </CardContent>
        </Card>
    );
};
