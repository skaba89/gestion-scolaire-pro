import { Card, CardContent } from "@/components/ui/card";
import { Calendar as CalendarIcon, Clock, PartyPopper, Users } from "lucide-react";

interface EventStatsProps {
    totalEvents: number;
    upcomingCount: number;
    todayCount: number;
    registrationCount: number;
}

export const EventStats = ({
    totalEvents,
    upcomingCount,
    todayCount,
    registrationCount
}: EventStatsProps) => {
    return (
        <div className="grid md:grid-cols-4 gap-4 mb-6">
            <Card className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-primary/10">
                            <CalendarIcon className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{totalEvents}</p>
                            <p className="text-sm text-muted-foreground">Total événements</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-green-500/10">
                            <Clock className="h-6 w-6 text-green-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{upcomingCount}</p>
                            <p className="text-sm text-muted-foreground">À venir</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-yellow-500/10">
                            <PartyPopper className="h-6 w-6 text-yellow-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{todayCount}</p>
                            <p className="text-sm text-muted-foreground">Aujourd'hui</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-purple-500/10">
                            <Users className="h-6 w-6 text-purple-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{registrationCount}</p>
                            <p className="text-sm text-muted-foreground">Inscriptions</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
