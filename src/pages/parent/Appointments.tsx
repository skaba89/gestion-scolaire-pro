import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { apiErrorDetail } from "@/lib/api-error";
import {
  type Appointment,
  type AppointmentSlot,
  type PersonRef,
  ACTIVE_STATUSES,
  STATUS_LABEL_KEYS,
  fullName,
  hhmm,
  isOnlineLocation,
} from "@/lib/appointments";
import { format, isFuture } from "date-fns";
import { 
  Calendar, 
  Plus, 
  Clock, 
  User, 
  Video,
  MapPin,
  X,
  MessageSquare
} from "lucide-react";
import { dateFnsLocale } from "@/lib/locale";

export default function Appointments() {
  const { t } = useTranslation();
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
      return Array.isArray(data) ? data.map((ps: { student?: PersonRef }) => ps.student).filter((c): c is PersonRef => !!c) : [];
    },
    enabled: !!user?.id,
  });

  // Fetch teachers. Was calling /parents/teachers/, which never existed
  // backend-side (404, permissions audit 2026-09) — /parents/children-
  // teachers/ is the real endpoint, scoped to this parent's own children.
  const { data: teachers } = useQuery({
    queryKey: ["teachers-for-appointments", tenant?.id],
    queryFn: async () => {
      const { data } = await apiClient.get<PersonRef[]>('/parents/children-teachers/');
      return Array.isArray(data) ? data : [];
    },
    enabled: !!tenant?.id,
  });

  // Fetch available slots for selected teacher
  const { data: availableSlots } = useQuery({
    queryKey: ["appointment-slots", formData.teacher_id],
    queryFn: async () => {
      // Le serveur ne renvoie que les créneaux à venir et non complets.
      const { data } = await apiClient.get<AppointmentSlot[]>('/parents/appointment-slots/', {
        params: { teacher_id: formData.teacher_id },
      });
      return data;
    },
    enabled: !!formData.teacher_id,
  });

  // Fetch appointments
  const { data: appointments } = useQuery({
    queryKey: ["parent-appointments", user?.id],
    queryFn: async () => {
      // Page { items } : l'ancien code attendait un tableau, la liste restait vide.
      const { data } = await apiClient.get<{ items: Appointment[] }>('/parents/appointments/', {
        params: { page_size: 100 },
      });
      return data.items ?? [];
    },
    enabled: !!user?.id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      // Enseignant, date et heure : le serveur les prend du créneau, qu'il
      // verrouille (pas de double réservation). Pas de colonne « sujet » :
      // il ouvre les notes.
      await apiClient.post('/parents/appointments/', {
        student_id: formData.student_id,
        slot_id: formData.slot_id,
        notes: [formData.subject.trim(), formData.notes.trim()].filter(Boolean).join("\n\n") || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["appointment-slots"] });
      setIsOpen(false);
      setFormData({ teacher_id: "", student_id: "", slot_id: "", subject: "", notes: "" });
      toast.success(t("appointments.bookingSuccess"));
    },
    onError: (error) => {
      // Créneau pris entre-temps (409) : la liste est rafraîchie.
      queryClient.invalidateQueries({ queryKey: ["appointment-slots"] });
      toast.error(`${t("appointments.bookingError")} : ${apiErrorDetail(error)}`);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      // Le créneau redevient disponible côté serveur.
      await apiClient.post(`/parents/appointments/${appointmentId}/cancel/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["appointment-slots"] });
      toast.success(t("appointments.cancelled"));
    },
    onError: (error) => toast.error(apiErrorDetail(error)),
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      REQUESTED: "outline", CONFIRMED: "default", CANCELLED: "destructive", COMPLETED: "secondary", NO_SHOW: "destructive",
    };
    const key = STATUS_LABEL_KEYS[status as Appointment["status"]] ?? STATUS_LABEL_KEYS.REQUESTED;
    return <Badge variant={variants[status] ?? "outline"}>{t(key)}</Badge>;
  };

  const startsAt = (a: Appointment) => new Date(`${a.appointment_date}T${a.start_time ?? "00:00:00"}`);
  const isUpcoming = (a: Appointment) => ACTIVE_STATUSES.includes(a.status) && isFuture(startsAt(a));
  const upcomingAppointments = appointments?.filter(isUpcoming) ?? [];
  const pastAppointments = appointments?.filter((a) => !isUpcoming(a)) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Calendar className="h-8 w-8 text-primary" />
            {t("appointments.pageTitle")}
          </h1>
          <p className="text-muted-foreground">
            {t("appointments.parentSubtitle")}
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {t("appointments.newAppointment")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("appointments.newAppointment")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("appointments.child")}</Label>
                <Select
                  value={formData.student_id}
                  onValueChange={(value) => setFormData({ ...formData, student_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("appointments.selectChild")} />
                  </SelectTrigger>
                  <SelectContent>
                    {children?.map((child) => (
                      <SelectItem key={child.id} value={child.id}>
                        {child.first_name} {child.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("appointments.teacher")}</Label>
                <Select
                  value={formData.teacher_id}
                  onValueChange={(value) => setFormData({ ...formData, teacher_id: value, slot_id: "" })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("appointments.selectTeacher")} />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers?.map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id}>
                        {teacher.first_name} {teacher.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.teacher_id && (
                <div className="space-y-2">
                  <Label>{t("appointments.availableSlot")}</Label>
                  {availableSlots?.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("appointments.noSlotForTeacher")}
                    </p>
                  ) : (
                    <Select
                      value={formData.slot_id}
                      onValueChange={(value) => setFormData({ ...formData, slot_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("appointments.chooseSlot")} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableSlots?.map((slot) => (
                          <SelectItem key={slot.id} value={slot.id}>
                            {t("appointments.slotRange", { date: format(new Date(`${slot.date}T00:00:00`), "EEEE d MMMM", { locale: dateFnsLocale() }), start: hhmm(slot.start_time), end: hhmm(slot.end_time) })}
                            {isOnlineLocation(slot.location) && ` ${t("appointments.inOnline")}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>{t("appointments.appointmentSubject")}</Label>
                <Input
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder={t("appointments.subjectPlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("appointments.notesOptional")}</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder={t("appointments.notesPlaceholder")}
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
                {t("appointments.confirmBtn")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="upcoming" className="space-y-4">
        <TabsList>
          <TabsTrigger value="upcoming">{t("appointments.upcoming")} ({upcomingAppointments.length})</TabsTrigger>
          <TabsTrigger value="past">{t("appointments.past")} ({pastAppointments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="space-y-4">
          {upcomingAppointments.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t("appointments.noUpcoming")}</p>
                <Button variant="link" onClick={() => setIsOpen(true)}>
                  {t("appointments.takeAppointment")}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {upcomingAppointments.map((apt) => (
                <Card key={apt.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">
                        {format(new Date(apt.appointment_date), "EEEE d MMMM", { locale: dateFnsLocale() })}
                      </CardTitle>
                      {getStatusBadge(apt.status)}
                    </div>
                    <CardDescription className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {hhmm(apt.start_time)}{apt.end_time ? ` - ${hhmm(apt.end_time)}` : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{fullName(apt.teacher)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{t("appointments.regarding")}</span>
                      <span className="font-medium text-foreground">{fullName(apt.student)}</span>
                    </div>
                    {apt.location && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {isOnlineLocation(apt.location) ? <Video className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
                        {isOnlineLocation(apt.location) ? (
                          <a href={apt.location} target="_blank" rel="noopener noreferrer" className="underline">
                            {t("appointments.online")}
                          </a>
                        ) : apt.location}
                      </div>
                    )}
                    {apt.notes && (
                      <div className="flex items-start gap-2 text-sm whitespace-pre-line">
                        <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
                        {apt.notes}
                      </div>
                    )}
                  </CardContent>
                  <CardFooter>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={cancelMutation.isPending}
                      onClick={() => cancelMutation.mutate(apt.id)}
                    >
                      <X className="h-4 w-4 mr-1" />
                      {t("common.cancel")}
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="past" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pastAppointments.map((apt) => (
              <Card key={apt.id} className="opacity-75">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {format(new Date(apt.appointment_date), "d MMM yyyy", { locale: dateFnsLocale() })}
                    </CardTitle>
                    {getStatusBadge(apt.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{fullName(apt.teacher)}</p>
                  <p className="text-sm">{fullName(apt.student)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
