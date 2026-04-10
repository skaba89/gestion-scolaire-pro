import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, MapPin, Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SubjectPreferredRoomsManagerProps {
    subjectId: string;
    tenantId: string;
}

export const SubjectPreferredRoomsManager = ({ subjectId, tenantId }: SubjectPreferredRoomsManagerProps) => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [selectedRoomId, setSelectedRoomId] = useState<string>("");
    const [adding, setAdding] = useState(false);

    // Fetch all rooms
    const { data: allRooms = [], isLoading: loadingRooms } = useQuery({
        queryKey: ["rooms", tenantId],
        queryFn: async () => {
            const response = await apiClient.get("/rooms", {
                params: { tenant_id: tenantId, ordering: "name" },
            });
            return response.data;
        },
        enabled: !!tenantId,
    });

    // Fetch subject rooms
    const { data: subjectRooms = [], isLoading: loadingSubjectRooms } = useQuery({
        queryKey: ["subject-rooms", subjectId],
        queryFn: async () => {
            const response = await apiClient.get("/subject-preferred-rooms", {
                params: { subject_id: subjectId },
            });
            return response.data;
        },
        enabled: !!subjectId,
    });

    // Filter available rooms
    const availableRooms = useMemo(() => {
        const assignedIds = new Set(subjectRooms.map((sr: any) => sr.room_id));
        return allRooms.filter((r: any) => !assignedIds.has(r.id));
    }, [allRooms, subjectRooms]);

    const handleAddRoom = async () => {
        if (!selectedRoomId) return;
        setAdding(true);
        try {
            await apiClient.post("/subject-preferred-rooms", {
                tenant_id: tenantId,
                subject_id: subjectId,
                room_id: selectedRoomId,
            });

            toast({ title: "Succès", description: "Salle préférentielle ajoutée" });
            setSelectedRoomId("");
            queryClient.invalidateQueries({ queryKey: ["subject-rooms", subjectId] });
        } catch (error: any) {
            toast({
                title: "Erreur",
                description: error?.response?.data?.detail || "Impossible d'ajouter la salle",
                variant: "destructive",
            });
        } finally {
            setAdding(false);
        }
    };

    const handleRemoveRoom = async (linkId: string) => {
        try {
            await apiClient.delete(`/subject-preferred-rooms/${linkId}`);

            toast({ title: "Succès", description: "Salle préférentielle retirée" });
            queryClient.invalidateQueries({ queryKey: ["subject-rooms", subjectId] });
        } catch (error: any) {
            toast({
                title: "Erreur",
                description: error?.response?.data?.detail || "Impossible de retirer la salle",
                variant: "destructive",
            });
        }
    };

    const isLoading = loadingRooms || loadingSubjectRooms;

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p>Chargement des salles...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Card className="border-none shadow-sm bg-muted/30">
                <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row gap-3 items-end">
                        <div className="w-full space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Ajouter une salle préférentielle
                            </label>
                            <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                                <SelectTrigger className="h-11 bg-background border-muted-foreground/20">
                                    <SelectValue placeholder="Sélectionner une salle..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableRooms.length === 0 ? (
                                        <div className="p-3 text-sm text-center text-muted-foreground">
                                            Toutes les salles sont déjà assignées.
                                        </div>
                                    ) : (
                                        availableRooms.map((room: any) => (
                                            <SelectItem key={room.id} value={room.id}>
                                                {room.name} {room.capacity && `(${room.capacity} places)`}
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            className="h-11 px-6 font-bold shadow-colored"
                            disabled={!selectedRoomId || adding}
                            onClick={handleAddRoom}
                        >
                            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                            Ajouter
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="space-y-3">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    Salles préférentielles ({subjectRooms.length})
                </h3>

                <ScrollArea className="h-[300px] pr-4">
                    {subjectRooms.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed rounded-xl text-muted-foreground gap-2">
                            <AlertCircle className="w-8 h-8 opacity-20" />
                            <p>Aucune salle préférentielle définie.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-2">
                            {subjectRooms.map((item: any) => (
                                <div
                                    key={item.id}
                                    className="flex items-center justify-between p-3 bg-background border border-border rounded-xl shadow-sm hover:shadow-md transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                                            <MapPin className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-foreground">{item.room?.name}</p>
                                            {item.room?.capacity && (
                                                <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                                                    {item.room.capacity} places
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => handleRemoveRoom(item.id)}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </div>
        </div>
    );
};
