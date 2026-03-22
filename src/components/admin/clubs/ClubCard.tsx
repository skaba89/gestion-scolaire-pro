import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Trash2, Settings, Users } from "lucide-react";

interface ClubCardProps {
    club: any;
    memberCount: number;
    members: any[];
    categoryConfig: any;
    onDelete: (id: string) => void;
    onManageMembers: (club: any) => void;
}

export function ClubCard({
    club,
    memberCount,
    members,
    categoryConfig,
    onDelete,
    onManageMembers,
}: ClubCardProps) {
    const Icon = categoryConfig.icon;

    return (
        <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-full ${categoryConfig.color}`}>
                            <Icon className="h-5 w-5" />
                        </div>
                        <div>
                            <CardTitle className="text-lg">{club.name}</CardTitle>
                            <Badge variant="outline" className={categoryConfig.color}>
                                {categoryConfig.label}
                            </Badge>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => onDelete(club.id)}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {club.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{club.description}</p>
                )}
                {club.meeting_schedule && (
                    <p className="text-sm flex items-center gap-2">
                        <Settings className="h-4 w-4 text-muted-foreground" />
                        {club.meeting_schedule}
                    </p>
                )}

                <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                        {memberCount} membre{memberCount !== 1 ? "s" : ""}
                        {club.max_members && ` / ${club.max_members}`}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => onManageMembers(club)}>
                        <Users className="h-4 w-4 mr-1" />
                        Gérer
                    </Button>
                </div>

                {members.length > 0 && (
                    <div className="flex -space-x-2">
                        {members.slice(0, 5).map((m: any) => (
                            <Avatar key={m.id} className="h-8 w-8 border-2 border-background">
                                <AvatarFallback className="text-xs bg-primary/10">
                                    {m.student?.first_name?.[0]}{m.student?.last_name?.[0]}
                                </AvatarFallback>
                            </Avatar>
                        ))}
                        {members.length > 5 && (
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs border-2 border-background">
                                +{members.length - 5}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
