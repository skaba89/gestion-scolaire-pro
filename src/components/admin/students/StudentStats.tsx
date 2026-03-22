import { Card, CardContent } from "@/components/ui/card";
import { UserCheck, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface StudentStatsProps {
    stats: {
        total: number;
        active: number;
    };
    isLoading: boolean;
    studentsLabel: string;
}

export const StudentStats = ({ stats, isLoading, studentsLabel }: StudentStatsProps) => {
    if (isLoading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[1, 2].map((i) => (
                    <Card key={i}>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <Skeleton className="w-10 h-10 rounded-lg" />
                                <div className="space-y-2">
                                    <Skeleton className="h-6 w-8" />
                                    <Skeleton className="h-3 w-24" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <UserCheck className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{stats.active}</p>
                            <p className="text-xs text-muted-foreground">{studentsLabel} actifs</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                            <Users className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{stats.total}</p>
                            <p className="text-xs text-muted-foreground">Total</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
