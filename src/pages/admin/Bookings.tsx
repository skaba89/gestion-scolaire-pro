import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { format, startOfWeek, addDays, isSameDay, parseISO, addMinutes } from "date-fns";
import { fr } from "date-fns/locale";
import { Plus, Calendar as CalendarIcon, MapPin, Users, Clock, Check, X, Trash2, Edit } from "lucide-react";

type ResourceType = "room" | "equipment" | "appointment";
type BookingStatus = "pending" | "approved" | "rejected" | "cancelled";

interface BookableResource {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  resource_type: ResourceType;
  location: string | null;
  capacity: number | null;
  requires_approval: boolean;
  is_active: boolean;
  available_days: number[];
  available_start_time: string;
  available_end_time: string;
  min_duration_minutes: number;
  max_duration_minutes: number;
}

interface Booking {
  id: string;
  tenant_id: string;
  resource_id: string;
  user_id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  resource?: BookableResource;
  user?: { first_name: string; last_name: string; email: string };
}

const resourceTypeLabels: Record<ResourceType, string> = {
  room: "Salle",
  equipment: "Équipement",
  appointment: "Rendez-vous",
};

const statusLabels: Record<BookingStatus, string> = {
  pending: "En attente",
  approved: "Approuvée",
  rejected: "Refusée",
  cancelled: "Annulée",
};

const statusColors: Record<BookingStatus, string> = {
  pending: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  approved: "bg-green-500/10 text-green-600 border-green-500/20",
  rejected: "bg-red-500/10 text-red-600 border-red-500/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export default function Bookings() {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("calendar");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [resourceDialogOpen, setResourceDialogOpen] = useState(false);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState<BookableResource | null>(null);
  const [editingResource, setEditingResource] = useState<BookableResource | null>(null);

  // Form states for resource
  const [resourceForm, setResourceForm] = useState({
    name: "",
    description: "",
    resource_type: "room" as ResourceType,
    location: "",
    capacity: "",
    requires_approval: false,
    available_start_time: "08:00",
    available_end_time: "18:00",
    min_duration_minutes: "30",
    max_duration_minutes: "480",
  });

  // Form states for booking
  const [bookingForm, setBookingForm] = useState({
    title: "",
    description: "",
    start_time: "09:00",
    end_time: "10:00",
  });

  // Fetch resources
  const { data: resources = [], isLoading: loadingResources } = useQuery({
    queryKey: ["bookable-resources", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      try {
        const { data } = await apiClient.get<BookableResource[]>("/school-life/bookable-resources/");
        return data || [];
      } catch { return []; }
    },
    enabled: !!tenant?.id,
  });

  // Fetch bookings
  const { data: bookings = [], isLoading: loadingBookings } = useQuery({
    queryKey: ["bookings", tenant?.id, selectedDate],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
      const weekEnd = addDays(weekStart, 7);
      try {
        const { data } = await apiClient.get<Booking[]>("/school-life/bookings/", {
          params: { start_after: weekStart.toISOString(), start_before: weekEnd.toISOString() }
        });
        return data || [];
      } catch { return []; }
    },
    enabled: !!tenant?.id,
  });

  // Fetch pending bookings
  const { data: pendingBookings = [] } = useQuery({
    queryKey: ["pending-bookings", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      try {
        const { data } = await apiClient.get<Booking[]>("/school-life/bookings/", {
          params: { status: "pending" }
        });
        return data || [];
      } catch { return []; }
    },
    enabled: !!tenant?.id,
  });

  // Create resource mutation
  const createResourceMutation = useMutation({
    mutationFn: async (data: typeof resourceForm) => {
      await apiClient.post("/school-life/bookable-resources/", {
        tenant_id: tenant!.id,
        name: data.name,
        description: data.description || null,
        resource_type: data.resource_type,
        location: data.location || null,
        capacity: data.capacity ? parseInt(data.capacity) : null,
        requires_approval: data.requires_approval,
        available_start_time: data.available_start_time,
        available_end_time: data.available_end_time,
        min_duration_minutes: parseInt(data.min_duration_minutes),
        max_duration_minutes: parseInt(data.max_duration_minutes),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookable-resources"] });
      toast.success("Ressource créée avec succès");
      setResourceDialogOpen(false);
      resetResourceForm();
    },
    onError: () => toast.error("Erreur lors de la création"),
  });

  // Update resource mutation
  const updateResourceMutation = useMutation({
    mutationFn: async (data: typeof resourceForm & { id: string }) => {
      await apiClient.put(`/school-life/bookable-resources/${data.id}/`, {
          name: data.name,
          description: data.description || null,
          resource_type: data.resource_type,
          location: data.location || null,
          capacity: data.capacity ? parseInt(data.capacity) : null,
          requires_approval: data.requires_approval,
          available_start_time: data.available_start_time,
          available_end_time: data.available_end_time,
          min_duration_minutes: parseInt(data.min_duration_minutes),
          max_duration_minutes: parseInt(data.max_duration_minutes),
        });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookable-resources"] });
      toast.success("Ressource mise à jour");
      setResourceDialogOpen(false);
      setEditingResource(null);
      resetResourceForm();
    },
    onError: () => toast.error("Erreur lors de la mise à jour"),
  });

  // Delete resource mutation
  const deleteResourceMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.patch(`/school-life/bookable-resources/${id}/`, { is_active: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookable-resources"] });
      toast.success("Ressource supprimée");
    },
  });

  // Create booking mutation
  const createBookingMutation = useMutation({
    mutationFn: async (data: typeof bookingForm) => {
      if (!selectedResource || !user) throw new Error("Missing data");
      
      const startDateTime = new Date(selectedDate);
      const [startHour, startMin] = data.start_time.split(":").map(Number);
      startDateTime.setHours(startHour, startMin, 0, 0);

      const endDateTime = new Date(selectedDate);
      const [endHour, endMin] = data.end_time.split(":").map(Number);
      endDateTime.setHours(endHour, endMin, 0, 0);

      // Check for conflicts
      try {
        await apiClient.get("/school-life/bookings/", {
          params: { resource_id: selectedResource.id, check_conflicts: 'true', start_before: endDateTime.toISOString(), end_after: startDateTime.toISOString() }
        });
      } catch (conflictError: any) {
        if (conflictError.response?.status === 409) {
          throw new Error("Ce créneau est déjà réservé");
        }
      }

      await apiClient.post("/school-life/bookings/", {
        tenant_id: tenant!.id,
        resource_id: selectedResource.id,
        user_id: user.id,
        title: data.title,
        description: data.description || null,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        status: selectedResource.requires_approval ? "pending" : "approved",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["pending-bookings"] });
      toast.success("Réservation créée avec succès");
      setBookingDialogOpen(false);
      setSelectedResource(null);
      setBookingForm({ title: "", description: "", start_time: "09:00", end_time: "10:00" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Update booking status mutation
  const updateBookingStatusMutation = useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: BookingStatus; reason?: string }) => {
      const updates: Record<string, unknown> = { status };
      if (status === "approved") {
        updates.approved_by = user?.id;
        updates.approved_at = new Date().toISOString();
      }
      if (status === "rejected" && reason) {
        updates.rejection_reason = reason;
      }
      await apiClient.put(`/school-life/bookings/${id}/`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["pending-bookings"] });
      toast.success("Statut mis à jour");
    },
  });

  const resetResourceForm = () => {
    setResourceForm({
      name: "",
      description: "",
      resource_type: "room",
      location: "",
      capacity: "",
      requires_approval: false,
      available_start_time: "08:00",
      available_end_time: "18:00",
      min_duration_minutes: "30",
      max_duration_minutes: "480",
    });
  };

  const handleEditResource = (resource: BookableResource) => {
    setEditingResource(resource);
    setResourceForm({
      name: resource.name,
      description: resource.description || "",
      resource_type: resource.resource_type,
      location: resource.location || "",
      capacity: resource.capacity?.toString() || "",
      requires_approval: resource.requires_approval,
      available_start_time: resource.available_start_time,
      available_end_time: resource.available_end_time,
      min_duration_minutes: resource.min_duration_minutes.toString(),
      max_duration_minutes: resource.max_duration_minutes.toString(),
    });
    setResourceDialogOpen(true);
  };

  const handleResourceSubmit = () => {
    if (editingResource) {
      updateResourceMutation.mutate({ ...resourceForm, id: editingResource.id });
    } else {
      createResourceMutation.mutate(resourceForm);
    }
  };

  // Generate week days
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Get bookings for a specific day
  const getBookingsForDay = (date: Date) => {
    return bookings.filter((b) => isSameDay(parseISO(b.start_time), date));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Réservations</h1>
          <p className="text-muted-foreground">Gérez les salles, équipements et rendez-vous</p>
        </div>
        <Dialog open={resourceDialogOpen} onOpenChange={(open) => {
          setResourceDialogOpen(open);
          if (!open) {
            setEditingResource(null);
            resetResourceForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nouvelle ressource
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingResource ? "Modifier la ressource" : "Nouvelle ressource"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nom *</Label>
                <Input
                  value={resourceForm.name}
                  onChange={(e) => setResourceForm({ ...resourceForm, name: e.target.value })}
                  placeholder="Salle de réunion A"
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select
                  value={resourceForm.resource_type}
                  onValueChange={(v: ResourceType) => setResourceForm({ ...resourceForm, resource_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="room">Salle</SelectItem>
                    <SelectItem value="equipment">Équipement</SelectItem>
                    <SelectItem value="appointment">Rendez-vous</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={resourceForm.description}
                  onChange={(e) => setResourceForm({ ...resourceForm, description: e.target.value })}
                  placeholder="Description de la ressource..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Emplacement</Label>
                  <Input
                    value={resourceForm.location}
                    onChange={(e) => setResourceForm({ ...resourceForm, location: e.target.value })}
                    placeholder="Bâtiment A, 2ème étage"
                  />
                </div>
                <div>
                  <Label>Capacité</Label>
                  <Input
                    type="number"
                    value={resourceForm.capacity}
                    onChange={(e) => setResourceForm({ ...resourceForm, capacity: e.target.value })}
                    placeholder="10"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Heure début</Label>
                  <Input
                    type="time"
                    value={resourceForm.available_start_time}
                    onChange={(e) => setResourceForm({ ...resourceForm, available_start_time: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Heure fin</Label>
                  <Input
                    type="time"
                    value={resourceForm.available_end_time}
                    onChange={(e) => setResourceForm({ ...resourceForm, available_end_time: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Nécessite approbation</Label>
                <Switch
                  checked={resourceForm.requires_approval}
                  onCheckedChange={(checked) => setResourceForm({ ...resourceForm, requires_approval: checked })}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleResourceSubmit}
                disabled={!resourceForm.name || createResourceMutation.isPending || updateResourceMutation.isPending}
              >
                {editingResource ? "Mettre à jour" : "Créer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="calendar">Calendrier</TabsTrigger>
          <TabsTrigger value="resources">Ressources</TabsTrigger>
          <TabsTrigger value="pending">
            En attente
            {pendingBookings.length > 0 && (
              <Badge variant="destructive" className="ml-2">{pendingBookings.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="space-y-4">
          <div className="flex gap-6">
            <Card className="w-fit">
              <CardContent className="p-4">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  locale={fr}
                />
              </CardContent>
            </Card>

            <div className="flex-1">
              <div className="flex gap-2 mb-4">
                {resources.map((resource) => (
                  <Button
                    key={resource.id}
                    variant={selectedResource?.id === resource.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setSelectedResource(resource);
                      setBookingDialogOpen(true);
                    }}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    {resource.name}
                  </Button>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {weekDays.map((day) => (
                  <div key={day.toISOString()} className="space-y-2">
                    <div className={`text-center p-2 rounded-lg ${isSameDay(day, selectedDate) ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      <div className="text-xs font-medium">
                        {format(day, "EEE", { locale: fr })}
                      </div>
                      <div className="text-lg font-bold">{format(day, "d")}</div>
                    </div>
                    <div className="space-y-1 min-h-[200px]">
                      {getBookingsForDay(day).map((booking) => (
                        <div
                          key={booking.id}
                          className={`p-2 rounded text-xs ${statusColors[booking.status]} border`}
                        >
                          <div className="font-medium truncate">{booking.title}</div>
                          <div className="text-[10px] opacity-75">
                            {format(parseISO(booking.start_time), "HH:mm")} - {format(parseISO(booking.end_time), "HH:mm")}
                          </div>
                          <div className="text-[10px] truncate">{booking.resource?.name}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="resources">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {resources.map((resource) => (
              <Card key={resource.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{resource.name}</CardTitle>
                      <Badge variant="outline" className="mt-1">
                        {resourceTypeLabels[resource.resource_type]}
                      </Badge>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEditResource(resource)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteResourceMutation.mutate(resource.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {resource.description && (
                    <p className="text-muted-foreground">{resource.description}</p>
                  )}
                  <div className="flex flex-wrap gap-3 text-muted-foreground">
                    {resource.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {resource.location}
                      </span>
                    )}
                    {resource.capacity && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {resource.capacity} places
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {resource.available_start_time} - {resource.available_end_time}
                    </span>
                  </div>
                  {resource.requires_approval && (
                    <Badge variant="secondary" className="text-xs">
                      Approbation requise
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
            {resources.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                Aucune ressource. Créez votre première ressource pour commencer.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="pending">
          <div className="space-y-4">
            {pendingBookings.map((booking) => (
              <Card key={booking.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="space-y-1">
                    <div className="font-medium">{booking.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {booking.resource?.name} • {format(parseISO(booking.start_time), "dd/MM/yyyy HH:mm", { locale: fr })} - {format(parseISO(booking.end_time), "HH:mm")}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Par {booking.user?.first_name} {booking.user?.last_name}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-green-600"
                      onClick={() => updateBookingStatusMutation.mutate({ id: booking.id, status: "approved" })}
                    >
                      <Check className="mr-1 h-4 w-4" />
                      Approuver
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600"
                      onClick={() => updateBookingStatusMutation.mutate({ id: booking.id, status: "rejected" })}
                    >
                      <X className="mr-1 h-4 w-4" />
                      Refuser
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {pendingBookings.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                Aucune réservation en attente d'approbation
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Booking Dialog */}
      <Dialog open={bookingDialogOpen} onOpenChange={setBookingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle réservation - {selectedResource?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Date: {format(selectedDate, "EEEE d MMMM yyyy", { locale: fr })}
            </div>
            <div>
              <Label>Titre *</Label>
              <Input
                value={bookingForm.title}
                onChange={(e) => setBookingForm({ ...bookingForm, title: e.target.value })}
                placeholder="Réunion d'équipe"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={bookingForm.description}
                onChange={(e) => setBookingForm({ ...bookingForm, description: e.target.value })}
                placeholder="Détails de la réservation..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Heure de début</Label>
                <Input
                  type="time"
                  value={bookingForm.start_time}
                  onChange={(e) => setBookingForm({ ...bookingForm, start_time: e.target.value })}
                />
              </div>
              <div>
                <Label>Heure de fin</Label>
                <Input
                  type="time"
                  value={bookingForm.end_time}
                  onChange={(e) => setBookingForm({ ...bookingForm, end_time: e.target.value })}
                />
              </div>
            </div>
            {selectedResource?.requires_approval && (
              <p className="text-sm text-yellow-600 bg-yellow-500/10 p-3 rounded-lg">
                Cette ressource nécessite une approbation. Votre demande sera examinée par un administrateur.
              </p>
            )}
            <Button
              className="w-full"
              onClick={() => createBookingMutation.mutate(bookingForm)}
              disabled={!bookingForm.title || createBookingMutation.isPending}
            >
              Réserver
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
