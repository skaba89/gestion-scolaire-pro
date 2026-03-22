import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { 
  Calendar, 
  Plus, 
  Trash2, 
  GraduationCap, 
  PartyPopper, 
  Users,
  CalendarDays
} from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isWithinInterval } from "date-fns";
import { fr } from "date-fns/locale";

const EVENT_TYPES = [
  { value: "event", label: "Événement", icon: CalendarDays, color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "exam", label: "Examen", icon: GraduationCap, color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "holiday", label: "Vacances", icon: PartyPopper, color: "bg-green-100 text-green-700 border-green-200" },
  { value: "meeting", label: "Réunion", icon: Users, color: "bg-orange-100 text-orange-700 border-orange-200" },
];

const SchoolCalendar = () => {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    event_type: "event",
    start_date: "",
    end_date: "",
    is_all_day: true,
    start_time: "",
    end_time: "",
  });

  const { data: events, isLoading } = useQuery({
    queryKey: ["school-events", tenant?.id, format(currentMonth, "yyyy-MM")],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      const start = startOfMonth(subMonths(currentMonth, 1));
      const end = endOfMonth(addMonths(currentMonth, 1));
      
      const { data, error } = await supabase
        .from("school_events")
        .select("*")
        .eq("tenant_id", tenant.id)
        .gte("start_date", format(start, "yyyy-MM-dd"))
        .lte("start_date", format(end, "yyyy-MM-dd"))
        .order("start_date");
      
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const createEventMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id || !formData.title || !formData.start_date) {
        throw new Error("Données incomplètes");
      }

      const { error } = await supabase
        .from("school_events")
        .insert({
          tenant_id: tenant.id,
          title: formData.title,
          description: formData.description || null,
          event_type: formData.event_type,
          start_date: formData.start_date,
          end_date: formData.end_date || formData.start_date,
          is_all_day: formData.is_all_day,
          start_time: formData.is_all_day ? null : formData.start_time,
          end_time: formData.is_all_day ? null : formData.end_time,
          created_by: user?.id,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-events"] });
      toast.success("Événement créé");
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from("school_events")
        .delete()
        .eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-events"] });
      toast.success("Événement supprimé");
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      event_type: "event",
      start_date: "",
      end_date: "",
      is_all_day: true,
      start_time: "",
      end_time: "",
    });
    setSelectedDate(null);
  };

  const openNewEventDialog = (date?: Date) => {
    if (date) {
      setFormData(prev => ({
        ...prev,
        start_date: format(date, "yyyy-MM-dd"),
        end_date: format(date, "yyyy-MM-dd"),
      }));
      setSelectedDate(date);
    }
    setDialogOpen(true);
  };

  const getEventsForDate = (date: Date) => {
    if (!events) return [];
    return events.filter(event => {
      const startDate = new Date(event.start_date);
      const endDate = event.end_date ? new Date(event.end_date) : startDate;
      return isWithinInterval(date, { start: startDate, end: endDate }) || 
             isSameDay(date, startDate) || 
             isSameDay(date, endDate);
    });
  };

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  // Get day of week for first day (0 = Sunday, 1 = Monday, etc.)
  const firstDayOfWeek = startOfMonth(currentMonth).getDay();
  // Adjust for Monday start (French calendar)
  const adjustedFirstDay = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Calendrier Scolaire</h1>
          <p className="text-muted-foreground">Événements, examens et vacances</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => openNewEventDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Nouvel événement
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Créer un événement</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Titre *</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Nom de l'événement"
                />
              </div>

              <div className="space-y-2">
                <Label>Type</Label>
                <Select 
                  value={formData.event_type} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, event_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <type.icon className="w-4 h-4" />
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date de début *</Label>
                  <Input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date de fin</Label>
                  <Input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_all_day"
                  checked={formData.is_all_day}
                  onCheckedChange={(checked) => 
                    setFormData(prev => ({ ...prev, is_all_day: !!checked }))
                  }
                />
                <Label htmlFor="is_all_day" className="font-normal">Toute la journée</Label>
              </div>

              {!formData.is_all_day && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Heure de début</Label>
                    <Input
                      type="time"
                      value={formData.start_time}
                      onChange={(e) => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Heure de fin</Label>
                    <Input
                      type="time"
                      value={formData.end_time}
                      onChange={(e) => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Détails de l'événement..."
                  rows={3}
                />
              </div>

              <Button 
                className="w-full" 
                onClick={() => createEventMutation.mutate()}
                disabled={!formData.title || !formData.start_date || createEventMutation.isPending}
              >
                Créer l'événement
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {EVENT_TYPES.map(type => (
          <Badge key={type.value} variant="outline" className={type.color}>
            <type.icon className="w-3 h-3 mr-1" />
            {type.label}
          </Badge>
        ))}
      </div>

      {/* Calendar Navigation */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            {format(currentMonth, "MMMM yyyy", { locale: fr })}
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}>
              ← Précédent
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>
              Aujourd'hui
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}>
              Suivant →
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(day => (
              <div key={day} className="text-center text-sm font-medium text-muted-foreground p-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for days before the first of the month */}
            {Array.from({ length: adjustedFirstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square" />
            ))}

            {days.map(day => {
              const dayEvents = getEventsForDate(day);
              const isToday = isSameDay(day, new Date());
              
              return (
                <div
                  key={day.toISOString()}
                  className={`aspect-square border rounded-lg p-1 cursor-pointer hover:bg-muted/50 transition-colors ${
                    isToday ? 'bg-primary/10 border-primary' : ''
                  }`}
                  onClick={() => openNewEventDialog(day)}
                >
                  <div className={`text-sm font-medium mb-1 ${isToday ? 'text-primary' : ''}`}>
                    {format(day, "d")}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 2).map(event => {
                      const typeConfig = EVENT_TYPES.find(t => t.value === event.event_type);
                      return (
                        <div
                          key={event.id}
                          className={`text-xs truncate px-1 py-0.5 rounded ${typeConfig?.color || 'bg-muted'}`}
                          title={event.title}
                        >
                          {event.title}
                        </div>
                      );
                    })}
                    {dayEvents.length > 2 && (
                      <div className="text-xs text-muted-foreground px-1">
                        +{dayEvents.length - 2}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Events List */}
      <Card>
        <CardHeader>
          <CardTitle>Événements à venir</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center py-4 text-muted-foreground">Chargement...</p>
          ) : events && events.length > 0 ? (
            <div className="space-y-3">
              {events
                .filter(e => new Date(e.start_date) >= new Date())
                .slice(0, 10)
                .map(event => {
                  const typeConfig = EVENT_TYPES.find(t => t.value === event.event_type);
                  const Icon = typeConfig?.icon || CalendarDays;
                  
                  return (
                    <div key={event.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${typeConfig?.color || 'bg-muted'}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-medium">{event.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(event.start_date), "EEEE d MMMM", { locale: fr })}
                            {event.end_date && event.end_date !== event.start_date && (
                              <> - {format(new Date(event.end_date), "d MMMM", { locale: fr })}</>
                            )}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteEventMutation.mutate(event.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="text-center py-8 text-muted-foreground">
              Aucun événement à venir
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SchoolCalendar;
