import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Calendar as CalendarIcon,
    MapPin,
    UserPlus,
    CheckCircle,
    Trash2,
    GraduationCap,
    Trophy,
    Music,
    PartyPopper,
    Megaphone
} from "lucide-react";
import { format, isPast } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { SchoolEvent } from "@/queries/admin";

export const eventTypeConfig: Record<string, { label: string; icon: any; color: string }> = {
    general: { label: "Général", icon: CalendarIcon, color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
    academic: { label: "Académique", icon: GraduationCap, color: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
    sport: { label: "Sport", icon: Trophy, color: "bg-green-500/10 text-green-600 border-green-500/20" },
    cultural: { label: "Culturel", icon: Music, color: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
    celebration: { label: "Célébration", icon: PartyPopper, color: "bg-pink-500/10 text-pink-600 border-pink-500/20" },
    announcement: { label: "Annonce", icon: Megaphone, color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
};

interface EventCardProps {
    event: SchoolEvent;
    onDelete: (id: string) => void;
    registrationCount: number;
}

export const EventCard = ({ event, onDelete, registrationCount }: EventCardProps) => {
    const config = eventTypeConfig[event.event_type] || eventTypeConfig.general;
    const Icon = config.icon;
    const isPastEvent = isPast(new Date(event.start_date));

    return (
        <Card className={cn("overflow-hidden group hover:shadow-lg transition-all duration-300", isPastEvent && "opacity-75")}>
            <div className={cn("h-3", config.color.split(" ")[0])} />
            <CardHeader className="pb-3 border-b border-muted/50">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                        <div className={cn("p-2 rounded-lg", config.color)}>
                            <Icon className="h-5 w-5" />
                        </div>
                        <Badge variant="outline" className={cn("font-semibold", config.color)}>
                            {config.label}
                        </Badge>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => onDelete(event.id)}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
                <CardTitle className="text-xl mt-3 line-clamp-1 group-hover:text-primary transition-colors">
                    {event.title}
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
                {event.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
                        {event.description}
                    </p>
                )}

                <div className="space-y-2 text-sm bg-muted/30 p-3 rounded-lg">
                    <div className="flex items-center gap-3 text-foreground/80">
                        <CalendarIcon className="h-4 w-4 text-primary" />
                        <span className="font-medium">
                            {format(new Date(event.start_date), "PPP à HH:mm", { locale: fr })}
                        </span>
                    </div>
                    {event.location && (
                        <div className="flex items-center gap-3 text-muted-foreground font-medium">
                            <MapPin className="h-4 w-4 text-primary" />
                            {event.location}
                        </div>
                    )}
                    {event.registration_required && (
                        <div className="flex items-center gap-3 text-muted-foreground font-medium">
                            <UserPlus className="h-4 w-4 text-primary" />
                            {registrationCount} inscription{registrationCount !== 1 ? "s" : ""}
                            {event.max_participants && (
                                <span className="text-xs ml-1">
                                    / {event.max_participants} places
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between pt-2">
                    {isPastEvent ? (
                        <Badge variant="secondary" className="bg-gray-100 text-gray-500 border-none">
                            <CheckCircle className="h-3 w-3 mr-1.5" />
                            Terminé
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                            À venir
                        </Badge>
                    )}

                    {event.creator && (
                        <div className="text-[10px] text-muted-foreground italic flex items-center gap-1">
                            <span>Créé par</span>
                            <span className="font-semibold">{event.creator.first_name} {event.creator.last_name}</span>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};
