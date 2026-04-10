import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Users, MapPin, Edit, Search, MoreVertical, Calendar, Building2, LayoutGrid } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { referenceQueries } from "@/queries/reference-data";
import { academicYearQueries } from "@/queries/academic-years";
import { Progress } from "@/components/ui/progress";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { List } from "lucide-react";

export const RoomsManager = () => {
    const { tenant } = useTenant();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [searchTerm, setSearchTerm] = useState("");
    const [formData, setFormData] = useState({
        name: "",
        capacity: "",
        type: "classroom",
        campus_id: "",
    });

    const { data: rooms = [], isLoading } = useQuery({
        queryKey: ["rooms", tenant?.id],
        queryFn: async () => {
            if (!tenant?.id) return [];
            const { data } = await apiClient.get<any[]>("/rooms/", {
                params: { tenant_id: tenant.id, ordering: "name" },
            });

            return data || [];
        },
        enabled: !!tenant?.id,
    });

    const { data: scheduleData = [] } = useQuery({
        queryKey: ["rooms-occupancy", tenant?.id],
        queryFn: async () => {
            if (!tenant?.id) return [];
            const { data } = await apiClient.get<any[]>("/schedule-slots/", {
                params: { tenant_id: tenant.id },
            });
            return data || [];
        },
        enabled: !!tenant?.id,
    });

    const { data: academicYears = [] } = useQuery({
        ...academicYearQueries.all(tenant?.id || ""),
        enabled: !!tenant?.id
    });
    const currentAcademicYear = academicYears.find(y => y.is_current);

    const { data: campuses = [] } = useQuery({
        ...referenceQueries.campuses(tenant?.id || ""),
        enabled: !!tenant,
    });

    const createRoomMutation = useMutation({
        mutationFn: async (data: typeof formData) => {
            await apiClient.post("/rooms/", {
                tenant_id: tenant!.id,
                name: data.name,
                capacity: data.capacity ? parseInt(data.capacity) : null,
                type: data.type,
                campus_id: data.campus_id || null,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["rooms"] });
            toast({ title: "Salle créée avec succès" });
            setIsDialogOpen(false);
            setFormData({ name: "", capacity: "", type: "classroom", campus_id: "" });
        },
        onError: (error: any) => {
            toast({
                title: "Erreur",
                description: error.message || "Erreur lors de la création",
                variant: "destructive"
            });
        },
    });

    const deleteRoomMutation = useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`/rooms/${id}/`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["rooms"] });
            toast({ title: "Salle supprimée" });
        },
        onError: (error: any) => {
            toast({
                title: "Impossible de supprimer la salle",
                description: "Cette salle est probablement liée à des cours ou des événements. Veuillez d'abord supprimer ces liaisons.",
                variant: "destructive"
            });
        },
    });

    const filteredRooms = rooms.filter(room => {
        const name = room.name || "";
        return name.toLowerCase().includes(searchTerm.toLowerCase());
    });

    const getOccupancyInfo = (roomName: string) => {
        const slots = scheduleData.filter(s => s.room_name === roomName);
        const assignedClasses = [...new Set(slots.map((s: any) => s.classrooms?.name))].filter(Boolean);

        // Calculate occupancy percentage based on a 8h-18h day (10 hours)
        // This is a simplified version
        const occupancyPercent = Math.min(Math.round((slots.length * 1.5 / 10) * 100), 100);

        return {
            classes: assignedClasses,
            percent: occupancyPercent,
            slots: slots
        };
    };

    return (
        <div className="space-y-6">
            <Card className="border-none shadow-sm bg-background/50 backdrop-blur-sm">
                <CardContent className="p-4 flex flex-wrap gap-4 items-center justify-between">
                    <div className="flex gap-4 items-center flex-1 min-w-[300px]">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                            <Input
                                placeholder="Rechercher une salle..."
                                className="pl-11 rounded-2xl h-12 border-none bg-muted/50 hover:bg-muted focus:bg-background transition-all"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Select defaultValue="all">
                            <SelectTrigger className="w-[180px] h-12 rounded-2xl border-none bg-muted/50">
                                <SelectValue placeholder="Toutes les salles" />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-none shadow-2xl">
                                <SelectItem value="all">Toutes les salles</SelectItem>
                                <SelectItem value="classroom">Classes standards</SelectItem>
                                <SelectItem value="lab">Laboratoires</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select defaultValue="today">
                            <SelectTrigger className="w-[180px] h-12 rounded-2xl border-none bg-muted/50">
                                <SelectValue placeholder="Tous les jours" />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-none shadow-2xl">
                                <SelectItem value="today">Aujourd'hui</SelectItem>
                                <SelectItem value="monday">Lundi</SelectItem>
                                <SelectItem value="tuesday">Mardi</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="bg-muted/50 p-1 rounded-xl flex items-center mr-2">
                            <Button
                                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                                size="icon"
                                onClick={() => setViewMode('grid')}
                                className="h-9 w-9 rounded-lg"
                                title="Vue grille"
                            >
                                <LayoutGrid className="h-4 w-4" />
                            </Button>
                            <Button
                                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                                size="icon"
                                onClick={() => setViewMode('list')}
                                className="h-9 w-9 rounded-lg"
                                title="Vue liste"
                            >
                                <List className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-semibold mr-4 hidden md:flex">
                            <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500"></div>
                                <span className="text-muted-foreground">Disponible</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-rose-500/20 border border-rose-500"></div>
                                <span className="text-muted-foreground">Occupé</span>
                            </div>
                        </div>

                        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="rounded-xl h-12 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all font-bold">
                                    <Plus className="w-5 h-5 mr-2" />
                                    Nouvelle salle
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="border-none shadow-2xl rounded-2xl max-h-[95vh] flex flex-col p-6">
                                <DialogHeader>
                                    <DialogTitle className="text-2xl font-bold font-display">Ajouter une salle</DialogTitle>
                                    <DialogDescription>Configurez un nouvel espace d'enseignement.</DialogDescription>
                                </DialogHeader>
                                <ScrollArea className="flex-1 px-1 overflow-y-auto">
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Nom de la salle</Label>
                                            <Input
                                                className="rounded-xl h-11 border-muted-foreground/20"
                                                placeholder="Ex: A101, Labo Sciences..."
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Capacité</Label>
                                                <Input
                                                    className="rounded-xl h-11 border-muted-foreground/20"
                                                    type="number"
                                                    placeholder="30"
                                                    value={formData.capacity}
                                                    onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Type</Label>
                                                <Select
                                                    value={formData.type}
                                                    onValueChange={(v) => setFormData({ ...formData, type: v })}
                                                >
                                                    <SelectTrigger className="rounded-xl h-11 border-muted-foreground/20">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="rounded-xl border-none shadow-2xl">
                                                        <SelectItem value="classroom">Classe standard</SelectItem>
                                                        <SelectItem value="lab">Laboratoire</SelectItem>
                                                        <SelectItem value="amphitheater">Amphithéâtre</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <Button
                                            className="w-full h-12 rounded-xl text-md font-bold shadow-colored"
                                            onClick={() => createRoomMutation.mutate(formData)}
                                            disabled={!formData.name || createRoomMutation.isPending}
                                        >
                                            {createRoomMutation.isPending ? "Création..." : "Ajouter la salle"}
                                        </Button>
                                    </div>
                                </ScrollArea>
                            </DialogContent>
                        </Dialog>
                    </div>
                </CardContent>
            </Card>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                    <p className="text-muted-foreground font-medium">Chargement des salles...</p>
                </div>
            ) : filteredRooms.length === 0 ? (
                <div className="text-center py-20 bg-background/50 rounded-3xl border-2 border-dashed border-muted">
                    <MapPin className="w-16 h-16 mx-auto mb-4 opacity-20 text-muted-foreground" />
                    <h3 className="text-xl font-bold mb-1">Aucune salle trouvée</h3>
                    <p className="text-muted-foreground">Commencez par ajouter les espaces physiques de votre école.</p>
                </div>
            ) : viewMode === 'list' ? (
                <div className="border rounded-3xl overflow-hidden bg-card/60 backdrop-blur-sm shadow-sm table-container-class">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent border-b border-muted/50">
                                <TableHead className="w-[300px] pl-6 h-12">Nom</TableHead>
                                <TableHead className="h-12">Type</TableHead>
                                <TableHead className="h-12">Campus</TableHead>
                                <TableHead className="h-12">Capacité</TableHead>
                                <TableHead className="h-12">Occupation</TableHead>
                                <TableHead className="h-12">Classes</TableHead>
                                <TableHead className="text-right h-12 pr-6">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredRooms.map((room: any) => {
                                const occupancy = getOccupancyInfo(room.name);
                                return (
                                    <TableRow key={room.id} className="hover:bg-muted/30 transition-colors border-b border-muted/50 last:border-0">
                                        <TableCell className="font-medium pl-6 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                                                    <MapPin className="w-5 h-5" />
                                                </div>
                                                <span className="font-display font-bold text-base">{room.name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <Badge variant="secondary" className="bg-muted/80 text-muted-foreground uppercase text-[10px] font-bold">
                                                {room.type === 'classroom' ? 'Classe' : 'Laboratoire'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="py-3">
                                            {room.campus ? (
                                                <Badge variant="outline" className="text-[10px] uppercase font-bold">{room.campus.name}</Badge>
                                            ) : (
                                                <span className="text-muted-foreground text-xs">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground font-medium">
                                                <Users className="w-4 h-4" />
                                                <span>{room.capacity || '-'}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <div className="flex items-center gap-3">
                                                <span className={`text-xs font-bold w-8 text-right ${occupancy.percent > 70 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                                    {occupancy.percent}%
                                                </span>
                                                <Progress value={occupancy.percent} className={`h-2 w-24 ${occupancy.percent > 70 ? 'bg-rose-100' : 'bg-emerald-100'}`} />
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <div className="flex flex-wrap gap-1">
                                                {occupancy.classes.length > 0 ? (
                                                    occupancy.classes.slice(0, 2).map((c: string) => (
                                                        <Badge key={c} variant="secondary" className="h-6 px-2 text-[10px] font-medium">
                                                            {c}
                                                        </Badge>
                                                    ))
                                                ) : (
                                                    <span className="text-xs text-muted-foreground/50 italic">-</span>
                                                )}
                                                {occupancy.classes.length > 2 && (
                                                    <Badge variant="secondary" className="h-6 px-2 text-[10px] font-medium">+{occupancy.classes.length - 2}</Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right pr-6 py-3">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted">
                                                        <MoreVertical className="w-4 h-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="rounded-xl border-none shadow-xl">
                                                    <DropdownMenuItem className="gap-2 cursor-pointer font-medium"><Edit className="w-4 h-4" /> Modifier</DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className="text-destructive gap-2 cursor-pointer font-medium focus:text-destructive focus:bg-destructive/10"
                                                        onClick={() => {
                                                            if (window.confirm("Êtes-vous sûr de vouloir supprimer cette salle ?")) {
                                                                deleteRoomMutation.mutate(room.id);
                                                            }
                                                        }}
                                                    >
                                                        <Trash2 className="w-4 h-4" /> Supprimer
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {filteredRooms.map((room: any) => {
                        const occupancy = getOccupancyInfo(room.name);
                        return (
                            <Card key={room.id} className="group border-none shadow-md hover:shadow-2xl transition-all duration-300 rounded-3xl overflow-hidden bg-card/60 backdrop-blur-sm">
                                <CardHeader className="pb-4">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold shadow-sm group-hover:bg-primary group-hover:text-white transition-all">
                                                <MapPin className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-xl font-bold font-display group-hover:text-primary transition-colors">{room.name}</CardTitle>
                                                <div className="flex gap-2 mt-1">
                                                    <Badge variant="secondary" className="text-[10px] bg-muted/80 text-muted-foreground font-bold uppercase">
                                                        {room.type === 'classroom' ? 'Classe' : 'Laboratoire'}
                                                    </Badge>
                                                    {room.campus && (
                                                        <Badge variant="outline" className="text-[10px] font-bold uppercase">{room.campus.name}</Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className={`text-sm font-black ${occupancy.percent > 70 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                                {occupancy.percent}% occupé
                                            </span>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div>
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Classes assignées:</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {occupancy.classes.length > 0 ? (
                                                occupancy.classes.map((c: string) => (
                                                    <Badge key={c} variant="secondary" className="rounded-lg h-6 px-3 bg-muted/50 hover:bg-muted transition-colors font-medium">
                                                        {c}
                                                    </Badge>
                                                ))
                                            ) : (
                                                <span className="text-xs italic text-muted-foreground">Aucune classe pour l'instant</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-3 pt-4 border-t border-muted/50">
                                        <div className="flex justify-between items-center text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                                            <span>Disponibilité aujourd'hui:</span>
                                        </div>
                                        <div className="relative pt-4">
                                            <div className="flex justify-between text-[9px] text-muted-foreground font-bold absolute -top-1 w-full px-1">
                                                <span>08h</span>
                                                <span>09h</span>
                                                <span>10h</span>
                                                <span>11h</span>
                                                <span>12h</span>
                                            </div>
                                            <div className="h-5 bg-emerald-500/10 rounded-xl overflow-hidden flex gap-0.5 p-0.5 border border-emerald-500/20">
                                                {/* Simple visualization of slots */}
                                                {[8, 9, 10, 11, 12].map(h => {
                                                    const isOccupied = occupancy.slots.some((s: any) => {
                                                        if (!s.start_time) return false;
                                                        const startH = parseInt(s.start_time.split(':')[0]);
                                                        return startH === h;
                                                    });
                                                    return (
                                                        <div key={h} className={`flex-1 rounded-sm transition-all ${isOccupied ? 'bg-rose-500 shadow-sm shadow-rose-200' : 'bg-emerald-500/40'}`}></div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-2">
                                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-bold">
                                            <Users className="w-3.5 h-3.5" />
                                            {room.capacity || '-'} places disponibles
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted">
                                                    <MoreVertical className="w-4 h-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="rounded-2xl border-none shadow-2xl">
                                                <DropdownMenuItem className="rounded-xl gap-2 cursor-pointer"><Edit className="w-4 h-4" /> Modifier</DropdownMenuItem>
                                                <DropdownMenuItem
                                                    className="text-destructive rounded-xl gap-2 cursor-pointer focus:bg-destructive/10"
                                                    onClick={() => {
                                                        if (window.confirm("Êtes-vous sûr de vouloir supprimer cette salle ?")) {
                                                            deleteRoomMutation.mutate(room.id);
                                                        }
                                                    }}
                                                >
                                                    <Trash2 className="w-4 h-4" /> Supprimer
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
