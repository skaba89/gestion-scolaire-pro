import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
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
import { apiErrorDetail } from "@/lib/api-error";
import {
  type Appointment,
  type AppointmentSlot,
  STATUS_LABEL_KEYS,
  fullName,
  hhmm,
  isOnlineLocation,
} from "@/lib/appointments";
import { format, addDays, startOfWeek } from "date-fns";
import { 
  Calendar, 
  Plus, 
  User, 
  Video,
  MapPin,
  Trash2,
  CheckCircle2
} from "lucide-react";
import { dateFnsLocale } from "@/lib/locale";

export default function AppointmentSlots() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    date: "",
    start_time: "",
    end_time: "",
    location: "",
    is_online: false,
    meeting_url: "",
  });

  const { data: slots } = useQuery({
    queryKey: ["teacher-slots", user?.id],
    queryFn: async () => {
      const { data } = await apiClient.get<{ items: AppointmentSlot[] }>("/school-life/appointment-slots/", {
        params: { teacher_id: user?.id, date_from: new Date().toISOString().split("T")[0] },
      });
      return data.items;
    },
    enabled: !!user?.id,
  });

  const { data: appointments } = useQuery({
    queryKey: ["teacher-appointments", user?.id],
    queryFn: async () => {
      // Le serveur limite déjà un enseignant à ses propres rendez-vous.
      const { data } = await apiClient.get<Appointment[]>("/school-life/appointment-slots/appointments/", {
        params: {
          status: "REQUESTED,CONFIRMED",
          from_date: new Date().toISOString().split("T")[0],
        },
      });
      return data;
    },
    enabled: !!user?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // Pas de colonne « en ligne » : le lien de visioconférence est le lieu.
      await apiClient.post("/school-life/appointment-slots/", {
        date: data.date,
        start_time: data.start_time,
        end_time: data.end_time,
        location: (data.is_online ? data.meeting_url : data.location) || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-slots"] });
      setIsOpen(false);
      setFormData({ date: "", start_time: "", end_time: "", location: "", is_online: false, meeting_url: "" });
      toast.success(t("appointments.slotAdded"));
    },
    onError: (error) => {
      toast.error(`${t("appointments.slotAddError")} : ${apiErrorDetail(error)}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (slotId: string) => {
      await apiClient.delete(`/school-life/appointment-slots/${slotId}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-slots"] });
      toast.success(t("teacherPortal.slots.deleted"));
    },
    onError: (error) => toast.error(apiErrorDetail(error)),
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "CONFIRMED" | "CANCELLED" }) => {
      await apiClient.patch(`/school-life/appointment-slots/appointments/${id}/`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-slots"] });
      toast.success(t("appointments.appointmentUpdated"));
    },
    onError: (error) => toast.error(apiErrorDetail(error)),
  });

  const generateWeekSlots = () => {
    const today = new Date();
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const slotsToCreate = [];

    for (let day = 0; day < 5; day++) {
      const date = addDays(weekStart, day + 7); // Next week
      for (let hour = 16; hour <= 18; hour++) {
        slotsToCreate.push({
          date: format(date, "yyyy-MM-dd"),
          start_time: `${hour}:00`,
          end_time: `${hour}:30`,
        });
      }
    }

    return slotsToCreate;
  };

  const bulkCreateMutation = useMutation({
    mutationFn: async () => {
      const slots = generateWeekSlots();
      await apiClient.post("/school-life/appointment-slots/bulk/", { slots });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-slots"] });
      toast.success(t("appointments.weekGenerated"));
    },
    onError: (error) => toast.error(apiErrorDetail(error)),
  });

  // Group slots by date
  const slotsByDate = slots?.reduce((acc: Record<string, AppointmentSlot[]>, slot) => {
    const date = slot.date;
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
            {t("appointments.pageTitle")}
          </h1>
          <p className="text-muted-foreground">
            {t("appointments.teacherSubtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => bulkCreateMutation.mutate()}>
            {t("appointments.generateWeek")}
          </Button>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                {t("appointments.addSlot")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("appointments.newSlot")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("appointments.date")}</Label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    min={new Date().toISOString().split("T")[0]}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("appointments.startTime")}</Label>
                    <Input
                      type="time"
                      value={formData.start_time}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("appointments.endTime")}</Label>
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
                  <Label>{t("appointments.onlineMeeting")}</Label>
                </div>
                {formData.is_online ? (
                  <div className="space-y-2">
                    <Label>{t("appointments.videoLink")}</Label>
                    <Input
                      value={formData.meeting_url}
                      onChange={(e) => setFormData({ ...formData, meeting_url: e.target.value })}
                      placeholder={t("teacherPortal.slots.onlinePlaceholder")}
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>{t("appointments.location")}</Label>
                    <Input
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      placeholder={t("teacherPortal.slots.roomPlaceholder")}
                    />
                  </div>
                )}
                <Button
                  onClick={() => createMutation.mutate(formData)}
                  disabled={!formData.date || !formData.start_time || !formData.end_time || createMutation.isPending}
                  className="w-full"
                >
                  {t("appointments.addSlotBtn")}
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
            <p className="text-sm text-muted-foreground">{t("appointments.availableSlots")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-orange-600">{bookedSlots.length}</div>
            <p className="text-sm text-muted-foreground">{t("appointments.bookedSlots")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{appointments?.length || 0}</div>
            <p className="text-sm text-muted-foreground">{t("appointments.upcomingAppointments")}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="slots" className="space-y-4">
        <TabsList>
          <TabsTrigger value="slots">{t("appointments.mySlots")}</TabsTrigger>
          <TabsTrigger value="appointments">{t("appointments.bookedAppointments")} ({appointments?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="slots" className="space-y-4">
          {Object.keys(slotsByDate).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t("appointments.noSlotsConfigured")}</p>
                <Button variant="link" onClick={() => setIsOpen(true)}>
                  {t("appointments.addSlot")}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {Object.entries(slotsByDate).map(([date, dateSlots]) => (
                <Card key={date}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">
                      {format(new Date(date), "EEEE d MMMM yyyy", { locale: dateFnsLocale() })}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-4">
                      {dateSlots.map((slot) => (
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
                              {hhmm(slot.start_time)} - {hhmm(slot.end_time)}
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
                              <Badge variant="secondary" className="text-xs">{t("appointments.booked")}</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            {isOnlineLocation(slot.location) ? (
                              <>
                                <Video className="h-3 w-3" />
                                {t("appointments.online")}
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
                <p>{t("appointments.noBookedAppointments")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {appointments.map((apt) => (
                <Card key={apt.id}>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center justify-between">
                      {format(new Date(apt.appointment_date), "EEEE d MMMM", { locale: dateFnsLocale() })}
                      <Badge variant={apt.status === "CONFIRMED" ? "default" : "outline"}>
                        {t(STATUS_LABEL_KEYS[apt.status] ?? "appointments.statusScheduled")}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      {hhmm(apt.start_time)}{apt.end_time ? ` - ${hhmm(apt.end_time)}` : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{fullName(apt.parent)}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {t("appointments.regarding")} <span className="text-foreground">{fullName(apt.student)}</span>
                    </div>
                    {apt.notes && (
                      <div className="text-sm whitespace-pre-line">{t("appointments.subject")} {apt.notes}</div>
                    )}
                    <div className="flex gap-2 pt-2">
                      {apt.status === "REQUESTED" && (
                        <Button
                          size="sm"
                          disabled={updateAppointmentMutation.isPending}
                          onClick={() => updateAppointmentMutation.mutate({ id: apt.id, status: "CONFIRMED" })}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          {t("appointments.confirm")}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={updateAppointmentMutation.isPending}
                        onClick={() => updateAppointmentMutation.mutate({ id: apt.id, status: "CANCELLED" })}
                      >
                        {t("common.cancel")}
                      </Button>
                    </div>
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
