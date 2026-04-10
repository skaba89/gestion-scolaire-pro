import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, MapPin, Globe } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface EventViewProps {
    events: any[];
    onEdit: (event: any) => void;
    onDelete: (id: string) => void;
    getRegistrationCount: (eventId: string) => number;
}

export function EventView({ events, onEdit, onDelete, getRegistrationCount }: EventViewProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Événements carrière</CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Événement</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Lieu</TableHead>
                            <TableHead>Participants</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {events.map((event) => (
                            <TableRow key={event.id}>
                                <TableCell>
                                    <div className="space-y-1">
                                        <p className="font-medium">{event.title}</p>
                                        <Badge variant="outline" className="text-[10px] uppercase">
                                            {event.event_type}
                                        </Badge>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {format(new Date(event.start_datetime), "dd MMM yyyy HH:mm", { locale: fr })}
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                        {event.is_online ? (
                                            <>
                                                <Globe className="h-3 w-3" />
                                                En ligne
                                            </>
                                        ) : (
                                            <>
                                                <MapPin className="h-3 w-3" />
                                                {event.location}
                                            </>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="text-sm">
                                        {getRegistrationCount(event.id)}
                                        {event.max_participants && ` / ${event.max_participants}`}
                                    </div>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-1">
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(event)}>
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-destructive"
                                            onClick={() => onDelete(event.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                        {events.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                    Aucun événement à venir
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
