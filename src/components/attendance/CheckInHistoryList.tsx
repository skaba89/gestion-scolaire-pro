import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CheckIn {
    id: string;
    check_in_type: 'ENTRY' | 'EXIT';
    checked_at: string;
    notes?: string;
}

interface CheckInHistoryListProps {
    checkIns: CheckIn[];
    isLoading?: boolean;
}

export const CheckInHistoryList = ({ checkIns, isLoading }: CheckInHistoryListProps) => {
    if (isLoading) {
        return (
            <Card className="shadow-sm border-primary/10">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Clock className="w-5 h-5 text-primary" />
                        Historique des pointages
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-12 w-full bg-muted animate-pulse rounded-lg" />
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="shadow-sm border-primary/10 overflow-hidden">
            <CardHeader className="bg-muted/30 border-b pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="w-5 h-5 text-primary" />
                    Historique des pointages
                </CardTitle>
                <CardDescription>Vos 10 derniers passages enregistrés.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
                <ScrollArea className="h-[300px]">
                    {checkIns.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Clock className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p>Aucun pointage enregistré récemment.</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {checkIns.map((checkIn) => (
                                <div key={checkIn.id} className="p-4 flex items-center justify-between hover:bg-muted/20 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${checkIn.check_in_type === 'ENTRY'
                                                ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30'
                                                : 'bg-rose-100 text-rose-600 dark:bg-rose-900/30'
                                            }`}>
                                            {checkIn.check_in_type === 'ENTRY' ? (
                                                <ArrowUpRight className="w-5 h-5" />
                                            ) : (
                                                <ArrowDownRight className="w-5 h-5" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm">
                                                {checkIn.check_in_type === 'ENTRY' ? 'Entrée dans l\'école' : 'Sortie de l\'école'}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {format(new Date(checkIn.checked_at), "EEEE d MMMM HH:mm", { locale: fr })}
                                            </p>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className={
                                        checkIn.check_in_type === 'ENTRY'
                                            ? 'border-emerald-500/50 text-emerald-600 bg-emerald-50/50'
                                            : 'border-rose-500/50 text-rose-600 bg-rose-50/50'
                                    }>
                                        {checkIn.check_in_type === 'ENTRY' ? 'Présent' : 'Parti'}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </CardContent>
        </Card>
    );
};
