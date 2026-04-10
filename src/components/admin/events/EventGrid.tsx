import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar as CalendarIcon } from "lucide-react";
import { EventCard } from "./EventCard";
import { SchoolEvent, EventRegistration } from "@/queries/admin";
import { isFuture, isPast } from "date-fns";

interface EventGridProps {
    events: SchoolEvent[];
    registrations: EventRegistration[];
    onDelete: (id: string) => void;
    filterType: string;
    onFilterChange: (type: string) => void;
}

const eventTypes = [
    { value: "all", label: "Tous" },
    { value: "upcoming", label: "À venir" },
    { value: "past", label: "Passés" },
    { value: "general", label: "Général" },
    { value: "academic", label: "Académique" },
    { value: "sport", label: "Sport" },
    { value: "cultural", label: "Culturel" },
];

export const EventGrid = ({
    events,
    registrations,
    onDelete,
    filterType,
    onFilterChange
}: EventGridProps) => {
    const getRegistrationCount = (eventId: string) => {
        return registrations.filter((r) => r.event_id === eventId).length;
    };

    const filteredEvents = events.filter((event) => {
        if (filterType === "all") return true;
        if (filterType === "upcoming") return isFuture(new Date(event.start_date));
        if (filterType === "past") return isPast(new Date(event.start_date));
        return event.event_type === filterType;
    });

    return (
        <Tabs value={filterType} onValueChange={onFilterChange}>
            <TabsList className="flex-wrap h-auto p-1 bg-muted/50">
                {eventTypes.map((type) => (
                    <TabsTrigger key={type.value} value={type.value} className="px-4 py-2">
                        {type.label}
                    </TabsTrigger>
                ))}
            </TabsList>

            <TabsContent value={filterType} className="mt-8">
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredEvents.map((event) => (
                        <EventCard
                            key={event.id}
                            event={event}
                            onDelete={onDelete}
                            registrationCount={getRegistrationCount(event.id)}
                        />
                    ))}

                    {filteredEvents.length === 0 && (
                        <Card className="col-span-full border-dashed bg-muted/20">
                            <CardContent className="py-20 text-center">
                                <CalendarIcon className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
                                <h3 className="font-semibold text-xl">Aucun événement trouvé</h3>
                                <p className="text-muted-foreground max-w-sm mx-auto mt-2">
                                    Ajustez vos filtres ou créez votre premier événement pour commencer à animer la vie scolaire.
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </TabsContent>
        </Tabs>
    );
};
