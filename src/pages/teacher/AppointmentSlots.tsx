import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import { 
  Calendar, 
  Plus, 
  Clock, 
  User, 
  Video,
  MapPin,
  Trash2,
  CheckCircle2
} from "lucide-react";

export default function AppointmentSlots() {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    slot_date: "",
    start_time: "",
    end_time: "",
    location: "",
    is_online: false,
    meeting_url: "",
  });

  const { data: slots, isLoading } = useQuery({
    queryKey: ["teacher-slots", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointment_slots")
        .select("*")
        .eq("teacher_id", user?.id)
        .gte("slot_date", new Date().toISOString().split("T")[0])
        .order("slot_date")
        .order("start_time");
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: appointments } = useQuery({
    queryKey: ["teacher-appointments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parent_teacher_appointments")
        .select(`
          *,
          parent:parent_id (first_name, last_name, email),
          student:student_id (first_name, last_name)
        `)
        .eq("teacher_id", user?.id)
        .in("status", ["scheduled", "confirmed"])
        .gte("appointment_date", new Date().toISOString().split("T")[0])
        .order("appointment_date")
        .order("start_time");
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from("appointment_slots")
        .insert({
          tenant_id: tenant?.id,
          teacher_id: user?.id,
          slot_date: data.slot_date,
          start_time: data.start_time,
          end_time: data.end_time,
          location: data.location || null,
          is_online: data.is_online,
          meeting_url: data.is_online ? data.meeting_url : null,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-slots"] });
      setIsOpen(false);
      setFormData({ slot_date: "", start_time: "", end_time: "", location: "", is_online: false, meeting_url: "" });
      toast.success("Créneau ajouté");
    },
    onError: () => {
      toast.error("Erreur lors de l'ajout");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (slotId: string) => {
      const { error } = await supabase
        .from("appointment_slots")
        .delete()
        .eq("id", slotId)
        .eq("is_available", true);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-slots"] });
      toast.success("Créneau supprimé");
    },
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("parent_teacher_appointments")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-appointments"] });
      toast.success("Rendez-vous mis à jour");
    },
  });

  const generateWeekSlots = () => {
    const today = new Date();
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const slotsToCreate = [];

    for (let day = 0; day < 5; day++) {
      const date = addDays(weekStart, day + 7); // Next week
      for (let hour = 16; hour <= 18; hour++) {
        slotsToCreate.push({
          tenant_id: tenant?.id,
          teacher_id: user?.id,
          slot_date: format(date, "yyyy-MM-dd"),
          start_time: `${hour}:00`,
          end_time: `${hour}:30`,
          is_online: false,
        });
      }
    }

    return slotsToCreate;
  };

  const bulkCreateMutation = useMutation({
    mutationFn: async () => {
      const slots = generateWeekSlots();
      const { error } = await supabase
        .from("appointment_slots")
        .insert(slots);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-slots"] });
      toast.success("Créneaux générés pour la semaine prochaine");
    },
  });

  // Group slots by date
  const slotsByDate = slots?.reduce((acc: Record<string, any[]>, slot) => {
    const date = slot.slot_date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(slot);
    return acc;
  }, {}) || {};

  const availableSlots = slots?.filter(s => s.is_available) || [];
  const bookedSlots = slots?.filter(s => !s.is_available) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Calendar className="h-8 w-8 text-primary" />
            Créneaux de Rendez-vous
          </h1>
          <p className="text-muted-foreground">
            Gérez vos disponibilités pour les rendez-vous parents
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => bulkCreateMutation.mutate()}>
            Générer semaine
          </Button>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Ajouter un créneau
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nouveau créneau</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={formData.slot_date}
                    onChange={(e) => setFormData({ ...formData, slot_date: e.target.value })}
                    min={new Date().toISOString().split("T")[0]}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Heure de début</Label>
                    <Input
                      type="time"
                      value={formData.start_time}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Heure de fin</Label>
                    <Input
                      type="time"
                      value={formData.end_time}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.is_online}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_online: checked })}
                  />
                  <Label>Rendez-vous en ligne</Label>
                </div>
                {formData.is_online ? (
                  <div className="space-y-2">
                    <Label>Lien de visioconférence</Label>
                    <Input
                      value={formData.meeting_url}
                      onChange={(e) => setFormData({ ...formData, meeting_url: e.target.value })}
                      placeholder="https://meet.google.com/..."
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Lieu</Label>
                    <Input
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      placeholder="Salle 101, Bureau..."
                    />
                  </div>
                )}
                <Button
                  onClick={() => createMutation.mutate(formData)}
                  disabled={!formData.slot_date || !formData.start_time || !formData.end_time || createMutation.isPending}
                  className="w-full"
                >
                  Ajouter le créneau
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{availableSlots.length}</div>
            <p className="text-sm text-muted-foreground">Créneaux disponibles</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-orange-600">{bookedSlots.length}</div>
            <p className="text-sm text-muted-foreground">Créneaux réservés</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{appointments?.length || 0}</div>
            <p className="text-sm text-muted-foreground">Rendez-vous à venir</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="slots" className="space-y-4">
        <TabsList>
          <TabsTrigger value="slots">Mes créneaux</TabsTrigger>
          <TabsTrigger value="appointments">Rendez-vous réservés ({appointments?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="slots" className="space-y-4">
          {Object.keys(slotsByDate).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Aucun créneau configuré</p>
                <Button variant="link" onClick={() => setIsOpen(true)}>
                  Ajouter un créneau
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {Object.entries(slotsByDate).map(([date, dateSlots]) => (
                <Card key={date}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">
                      {format(new Date(date), "EEEE d MMMM yyyy", { locale: fr })}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-4">
                      {dateSlots.map((slot: any) => (
                        <div
                          key={slot.id}
                          className={`p-3 rounded-lg border ${
                            slot.is_available 
                              ? "bg-green-50 border-green-200" 
                              : "bg-orange-50 border-orange-200"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">
                              {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                            </span>
                            {slot.is_available ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => deleteMutation.mutate(slot.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            ) : (
                              <Badge variant="secondary" className="text-xs">Réservé</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            {slot.is_online ? (
                              <>
                                <Video className="h-3 w-3" />
                                En ligne
                              </>
                            ) : slot.location ? (
                              <>
                                <MapPin className="h-3 w-3" />
                                {slot.location}
                              </>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="appointments" className="space-y-4">
          {!appointments?.length ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Aucun rendez-vous réservé</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {appointments.map((apt: any) => (
                <Card key={apt.id}>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center justify-between">
                      {format(new Date(apt.appointment_date), "EEEE d MMMM", { locale: fr })}
                      <Badge variant={apt.status === "confirmed" ? "default" : "outline"}>
                        {apt.status === "confirmed" ? "Confirmé" : "En attente"}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      {apt.start_time.slice(0, 5)} - {apt.end_time.slice(0, 5)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{apt.parent?.first_name} {apt.parent?.last_name}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Concernant: <span className="text-foreground">{apt.student?.first_name} {apt.student?.last_name}</span>
                    </div>
                    {apt.subject && (
                      <div className="text-sm">Sujet: {apt.subject}</div>
                    )}
                    {apt.status === "scheduled" && (
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          onClick={() => updateAppointmentMutation.mutate({ id: apt.id, status: "confirmed" })}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Confirmer
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
