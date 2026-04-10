import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, Clock, Eye, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface AdmissionStatsProps {
    stats: {
        total: number;
        submitted: number;
        underReview: number;
        accepted: number;
    };
    isLoading: boolean;
}

export const AdmissionStats = ({ stats, isLoading }: AdmissionStatsProps) => {
    if (isLoading) {
        return (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                    <Card key={i}>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <Skeleton className="w-10 h-10 rounded-lg" />
                                <div className="space-y-2">
                                    <Skeleton className="h-6 w-8" />
                                    <Skeleton className="h-3 w-12" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <FileText className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{stats.total}</p>
                            <p className="text-xs text-muted-foreground">Total</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-secondary/50 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-secondary-foreground" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{stats.submitted}</p>
                            <p className="text-xs text-muted-foreground">Soumises</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-accent/50 flex items-center justify-center">
                            <Eye className="w-5 h-5 text-accent-foreground" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{stats.underReview}</p>
                            <p className="text-xs text-muted-foreground">En cours</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{stats.accepted}</p>
                            <p className="text-xs text-muted-foreground">Acceptées</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
