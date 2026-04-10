import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format, isFuture, isPast } from "date-fns";
import { fr } from "date-fns/locale";
import { 
  Calendar, 
  Plus, 
  Clock, 
  User, 
  Video,
  MapPin,
  CheckCircle2,
  X,
  MessageSquare
} from "lucide-react";

export default function Appointments() {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    teacher_id: "",
    student_id: "",
    slot_id: "",
    subject: "",
    notes: "",
  });

  // Fetch parent's children
  const { data: children } = useQuery({
    queryKey: ["parent-children", user?.id],
    queryFn: async () => {
      const { data } = await apiClient.get('/parents/children/', {
        params: { parent_id: user?.id },
      });
      return Array.isArray(data) ? data.map((ps: any) => ps.student).filter(Boolean) : [];
    },
    enabled: !!user?.id,
  });

  // Fetch teachers
  const { data: teachers } = useQuery({
    queryKey: ["teachers-for-appointments", tenant?.id],
    queryFn: async () => {
      const { data } = await apiClient.get('/parents/teachers/', {
        params: { tenant_id: tenant?.id },
      });
      return Array.isArray(data) ? data : [];
    },
    enabled: !!tenant?.id,
  });

  // Fetch available slots for selected teacher
  const { data: availableSlots } = useQuery({
    queryKey: ["appointment-slots", formData.teacher_id],
    queryFn: async () => {
      const { data } = await apiClient.get('/parents/appointment-slots/', {
        params: {
          teacher_id: formData.teacher_id,
          is_available: true,
          slot_date_from: new Date().toISOString().split("T")[0],
        },
      });
      return Array.isArray(data) ? data : [];
    },
    enabled: !!formData.teacher_id,
  });

  // Fetch appointments
  const { data: appointments, isLoading } = useQuery({
    queryKey: ["parent-appointments", user?.id],
    queryFn: async () => {
      const { data } = await apiClient.get('/parents/appointments/', {
        params: { parent_id: user?.id },
      });
      return Array.isArray(data) ? data : [];
    },
    enabled: !!user?.id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const slot = availableSlots?.find(s => s.id === formData.slot_id);
      if (!slot) throw new Error("Créneau non trouvé");

      await apiClient.post('/parents/appointments/', {
        tenant_id: tenant?.id,
        parent_id: user?.id,
        teacher_id: formData.teacher_id,
        student_id: formData.student_id,
        slot_id: formData.slot_id,
        appointment_date: slot.slot_date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        subject: formData.subject,
        notes: formData.notes,
      });

      // Mark slot as unavailable
      await apiClient.put(`/parents/appointment-slots/${formData.slot_id}/`, { is_available: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["appointment-slots"] });
      setIsOpen(false);
      setFormData({ teacher_id: "", student_id: "", slot_id: "", subject: "", notes: "" });
      toast.success("Rendez-vous réservé avec succès");
    },
    onError: () => {
      toast.error("Erreur lors de la réservation");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      const appointment = appointments?.find(a => a.id === appointmentId);
      
      await apiClient.put(`/parents/appointments/${appointmentId}/`, {
        status: "cancelled",
        cancelled_by: user?.id,
        cancellation_reason: "Annulé par le parent",
      });

      // Make slot available again
      if (appointment?.slot_id) {
        await apiClient.put(`/parents/appointment-slots/${appointment.slot_id}/`, { is_available: true });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["appointment-slots"] });
      toast.success("Rendez-vous annulé");
    },
  });

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      scheduled: { variant: "outline", label: "Planifié" },
      confirmed: { variant: "default", label: "Confirmé" },
      cancelled: { variant: "destructive", label: "Annulé" },
      completed: { variant: "secondary", label: "Terminé" },
      no_show: { variant: "destructive", label: "Absent" },
    };
    const config = configs[status] || configs.scheduled;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const upcomingAppointments = appointments?.filter(a => 
    ["scheduled", "confirmed"].includes(a.status) && 
    isFuture(new Date(`${a.appointment_date}T${a.start_time}`))
  ) || [];
  
  const pastAppointments = appointments?.filter(a => 
    isPast(new Date(`${a.appointment_date}T${a.end_time}`)) ||
    ["cancelled", "completed", "no_show"].includes(a.status)
  ) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Calendar className="h-8 w-8 text-primary" />
            Rendez-vous
          </h1>
          <p className="text-muted-foreground">
            Prenez rendez-vous avec les enseignants de vos enfants
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Prendre rendez-vous
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Nouveau rendez-vous</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Enfant concerné</Label>
                <Select
                  value={formData.student_id}
                  onValueChange={(value) => setFormData({ ...formData, student_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un enfant" />
                  </SelectTrigger>
                  <SelectContent>
                    {children?.map((child: any) => (
                      <SelectItem key={child.id} value={child.id}>
                        {child.first_name} {child.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Enseignant</Label>
                <Select
                  value={formData.teacher_id}
                  onValueChange={(value) => setFormData({ ...formData, teacher_id: value, slot_id: "" })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un enseignant" />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers?.map((teacher: any) => (
                      <SelectItem key={teacher.id} value={teacher.id}>
                        {teacher.first_name} {teacher.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.teacher_id && (
                <div className="space-y-2">
                  <Label>Créneau disponible</Label>
                  {availableSlots?.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Aucun créneau disponible pour cet enseignant
                    </p>
                  ) : (
                    <Select
                      value={formData.slot_id}
                      onValueChange={(value) => setFormData({ ...formData, slot_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir un créneau" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableSlots?.map((slot: any) => (
                          <SelectItem key={slot.id} value={slot.id}>
                            {format(new Date(slot.slot_date), "EEEE d MMMM", { locale: fr })} - {slot.start_time.slice(0, 5)} à {slot.end_time.slice(0, 5)}
                            {slot.is_online && " (en ligne)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Sujet du rendez-vous</Label>
                <Input
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="Ex: Suivi scolaire, Comportement..."
                />
              </div>

              <div className="space-y-2">
                <Label>Notes (optionnel)</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Points à aborder..."
                />
              </div>

              <Button
                onClick={() => createMutation.mutate()}
                disabled={
                  !formData.student_id || 
                  !formData.teacher_id || 
                  !formData.slot_id ||
                  createMutation.isPending
                }
                className="w-full"
              >
                Confirmer le rendez-vous
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="upcoming" className="space-y-4">
        <TabsList>
          <TabsTrigger value="upcoming">À venir ({upcomingAppointments.length})</TabsTrigger>
          <TabsTrigger value="past">Passés ({pastAppointments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="space-y-4">
          {upcomingAppointments.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Aucun rendez-vous à venir</p>
                <Button variant="link" onClick={() => setIsOpen(true)}>
                  Prendre un rendez-vous
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {upcomingAppointments.map((apt: any) => (
                <Card key={apt.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">
                        {format(new Date(apt.appointment_date), "EEEE d MMMM", { locale: fr })}
                      </CardTitle>
                      {getStatusBadge(apt.status)}
                    </div>
                    <CardDescription className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {apt.start_time.slice(0, 5)} - {apt.end_time.slice(0, 5)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {apt.teacher?.first_name} {apt.teacher?.last_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Concernant:</span>
                      <span className="font-medium text-foreground">
                        {apt.student?.first_name} {apt.student?.last_name}
                      </span>
                    </div>
                    {apt.subject && (
                      <div className="flex items-center gap-2 text-sm">
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        {apt.subject}
                      </div>
                    )}
                  </CardContent>
                  <CardFooter>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => cancelMutation.mutate(apt.id)}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Annuler
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="past" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pastAppointments.map((apt: any) => (
              <Card key={apt.id} className="opacity-75">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {format(new Date(apt.appointment_date), "d MMM yyyy", { locale: fr })}
                    </CardTitle>
                    {getStatusBadge(apt.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {apt.teacher?.first_name} {apt.teacher?.last_name}
                  </p>
                  <p className="text-sm">
                    {apt.student?.first_name} {apt.student?.last_name}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
