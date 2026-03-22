import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
    Calendar,
    Megaphone,
    Trash2,
    Pin,
    Lock
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Announcement } from "@/queries/communication";

interface AnnouncementListProps {
    announcements: Announcement[];
    onDelete: (id: string) => void;
    roleLabels: Record<string, string>;
}

export const AnnouncementList = ({
    announcements,
    onDelete,
    roleLabels,
}: AnnouncementListProps) => {
    if (announcements.length === 0) {
        return (
            <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                    <Megaphone className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-20" />
                    <h3 className="font-medium text-lg">Aucune annonce</h3>
                    <p className="text-muted-foreground">Les communications officielles s'afficheront ici</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="grid gap-6">
            {announcements.map((announcement) => (
                <Card key={announcement.id} className={cn(announcement.pinned && "border-primary/50 bg-primary/5 shadow-md shadow-primary/5")}>
                    <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    {announcement.pinned && <Pin className="h-4 w-4 text-primary fill-primary" />}
                                    <CardTitle className="text-xl">{announcement.title}</CardTitle>
                                </div>
                                <CardDescription className="flex items-center gap-2">
                                    <Calendar className="h-3 w-3" />
                                    Publié le {format(new Date(announcement.created_at), "PPP à HH:mm", { locale: fr })}
                                </CardDescription>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:bg-destructive/10"
                                onClick={() => {
                                    if (confirm("Supprimer cette annonce ?")) {
                                        onDelete(announcement.id);
                                    }
                                }}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="whitespace-pre-wrap text-foreground/80 leading-relaxed">
                            {announcement.content}
                        </p>
                        <div className="pt-4 border-t flex items-center justify-between">
                            <div className="flex flex-wrap gap-2">
                                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 mr-2 italic">
                                    Visible par :
                                </span>
                                {(announcement.target_roles || []).map((role) => (
                                    <Badge key={role} variant="secondary" className="text-[10px] uppercase">
                                        {roleLabels[role] || role}
                                    </Badge>
                                ))}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Lock className="h-3 w-3" />
                                Sécurisé
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
};
