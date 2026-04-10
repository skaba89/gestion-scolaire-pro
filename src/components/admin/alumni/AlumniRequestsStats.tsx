import { Card, CardContent } from "@/components/ui/card";
import { Clock, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

interface AlumniRequestsStatsProps {
    stats: {
        pending: number;
        inProgress: number;
        awaitingValidation: number;
        completed: number;
    };
}

export function AlumniRequestsStats({ stats }: AlumniRequestsStatsProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">En attente</p>
                            <p className="text-2xl font-bold">{stats.pending}</p>
                        </div>
                        <Clock className="w-8 h-8 text-yellow-500" />
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">En cours</p>
                            <p className="text-2xl font-bold">{stats.inProgress}</p>
                        </div>
                        <Loader2 className="w-8 h-8 text-blue-500" />
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">En validation</p>
                            <p className="text-2xl font-bold">{stats.awaitingValidation}</p>
                        </div>
                        <AlertCircle className="w-8 h-8 text-purple-500" />
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Terminées</p>
                            <p className="text-2xl font-bold">{stats.completed}</p>
                        </div>
                        <CheckCircle2 className="w-8 h-8 text-green-500" />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
