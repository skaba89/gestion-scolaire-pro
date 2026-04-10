import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet } from "lucide-react";

interface AccountingExportTabsProps {
    invoiceCount: number;
    paymentCount: number;
    onExportCSV: (type: "invoices" | "payments" | "journal") => void;
    onExportSage: () => void;
    onExportCiel: () => void;
}

export const AccountingExportTabs = ({
    invoiceCount,
    paymentCount,
    onExportCSV,
    onExportSage,
    onExportCiel,
}: AccountingExportTabsProps) => {
    return (
        <Tabs defaultValue="standard">
            <TabsList className="bg-muted/50 p-1">
                <TabsTrigger value="standard" className="px-6">Export Standard</TabsTrigger>
                <TabsTrigger value="sage" className="px-6">Format Sage</TabsTrigger>
                <TabsTrigger value="ciel" className="px-6">Format Ciel</TabsTrigger>
                <TabsTrigger value="fec" className="px-6">Format FEC</TabsTrigger>
            </TabsList>

            <TabsContent value="standard" className="space-y-6 focus-visible:outline-none">
                <Card>
                    <CardHeader>
                        <CardTitle>Exports CSV/Excel</CardTitle>
                        <CardDescription>Format universel compatible avec tous les logiciels</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Button variant="outline" className="h-24 flex-col gap-2 hover:bg-muted/50" onClick={() => onExportCSV("invoices")}>
                                <FileSpreadsheet className="h-8 w-8 text-green-600" />
                                <div className="text-center">
                                    <p className="font-medium">Exporter les factures</p>
                                    <p className="text-xs text-muted-foreground">{invoiceCount} factures</p>
                                </div>
                            </Button>
                            <Button variant="outline" className="h-24 flex-col gap-2 hover:bg-muted/50" onClick={() => onExportCSV("payments")}>
                                <FileSpreadsheet className="h-8 w-8 text-blue-600" />
                                <div className="text-center">
                                    <p className="font-medium">Exporter les paiements</p>
                                    <p className="text-xs text-muted-foreground">{paymentCount} paiements</p>
                                </div>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="sage" className="space-y-6 focus-visible:outline-none">
                <Card>
                    <CardHeader>
                        <CardTitle>Export Sage Comptabilité</CardTitle>
                        <CardDescription>Format compatible avec Sage 50, Sage 100 et Sage Business Cloud</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button onClick={onExportSage} className="h-24 flex-col gap-2 w-full md:w-64">
                            <Download className="h-8 w-8" />
                            <div className="text-center">
                                <p className="font-medium">Télécharger export Sage</p>
                                <p className="text-xs opacity-80">Format .txt</p>
                            </div>
                        </Button>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="ciel" className="space-y-6 focus-visible:outline-none">
                <Card>
                    <CardHeader>
                        <CardTitle>Export Ciel Compta</CardTitle>
                        <CardDescription>Format compatible avec Ciel Compta et Ciel Gestion Commerciale</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button onClick={onExportCiel} className="h-24 flex-col gap-2 w-full md:w-64">
                            <Download className="h-8 w-8" />
                            <div className="text-center">
                                <p className="font-medium">Télécharger export Ciel</p>
                                <p className="text-xs opacity-80">Format .csv</p>
                            </div>
                        </Button>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="fec" className="space-y-6 focus-visible:outline-none">
                <Card>
                    <CardHeader>
                        <CardTitle>Fichier des Écritures Comptables (FEC)</CardTitle>
                        <CardDescription>Format légal français obligatoire pour les contrôles fiscaux</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-lg p-4 mb-4">
                            <p className="text-sm text-amber-800 dark:text-amber-200">
                                Le FEC est un fichier normé obligatoire en France. Il doit être fourni à l'administration fiscale en cas de contrôle.
                            </p>
                        </div>
                        <Button onClick={() => onExportCSV("journal")} className="h-24 flex-col gap-2 w-full md:w-64">
                            <Download className="h-8 w-8" />
                            <div className="text-center">
                                <p className="font-medium">Générer le FEC</p>
                                <p className="text-xs opacity-80">Format normé .txt</p>
                            </div>
                        </Button>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
    );
};
