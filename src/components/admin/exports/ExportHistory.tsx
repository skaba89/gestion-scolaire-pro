import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle, Download } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface ExportHistoryItem {
    type: string;
    format: string;
    date: Date;
    rows: number;
}

interface ExportHistoryProps {
    history: ExportHistoryItem[];
}

export const ExportHistory = ({ history }: ExportHistoryProps) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Historique des exports
                </CardTitle>
                <CardDescription>Vos 10 derniers exports</CardDescription>
            </CardHeader>
            <CardContent>
                {history.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
                        <Download className="h-12 w-12 mx-auto mb-4 opacity-20" />
                        <p>Aucun export effectué</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {history.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between p-4 border rounded-xl hover:bg-muted/30 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-full bg-green-500/10">
                                        <CheckCircle className="h-5 w-5 text-green-500" />
                                    </div>
                                    <div>
                                        <p className="font-medium">{item.type}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {format(item.date, "dd MMM yyyy à HH:mm", { locale: fr })}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Badge variant="outline" className="rounded-md font-medium">{item.rows} lignes</Badge>
                                    <Badge variant="secondary" className="rounded-md uppercase">{item.format}</Badge>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
