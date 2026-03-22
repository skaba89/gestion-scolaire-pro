import { Card, CardContent } from "@/components/ui/card";
import { Users, UserPlus, Trophy, Palette } from "lucide-react";

interface ClubsStatsProps {
    totalClubs: number;
    totalMemberships: number;
    sportsClubs: number;
    artsClubs: number;
}

export function ClubsStats({
    totalClubs,
    totalMemberships,
    sportsClubs,
    artsClubs,
}: ClubsStatsProps) {
    return (
        <div className="grid md:grid-cols-4 gap-4">
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-primary/10">
                            <Users className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{totalClubs}</p>
                            <p className="text-sm text-muted-foreground">Clubs actifs</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-green-500/10">
                            <UserPlus className="h-6 w-6 text-green-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{totalMemberships}</p>
                            <p className="text-sm text-muted-foreground">Adhésions totales</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-purple-500/10">
                            <Trophy className="h-6 w-6 text-purple-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{sportsClubs}</p>
                            <p className="text-sm text-muted-foreground">Clubs sportifs</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-pink-500/10">
                            <Palette className="h-6 w-6 text-pink-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{artsClubs}</p>
                            <p className="text-sm text-muted-foreground">Clubs artistiques</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
