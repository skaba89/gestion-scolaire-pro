import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { isToday, isFuture } from "date-fns";
import { adminQueries, SchoolEvent } from "@/queries/admin";

// Modular components
import { EventHeader } from "@/components/admin/events/EventHeader";
import { EventStats } from "@/components/admin/events/EventStats";
import { EventGrid } from "@/components/admin/events/EventGrid";
import { EventDialog } from "@/components/admin/events/EventDialog";

export default function Events() {
  const { tenant } = useTenant();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");

  // Fetch events
  const { data: events = [] } = useQuery({
    ...adminQueries.events(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  // Fetch registrations
  const { data: registrations = [] } = useQuery({
    ...adminQueries.eventRegistrations(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  // Create event mutation
  const createEventMutation = useMutation({
    mutationFn: (data: any) => adminQueries.createEvent(tenant!.id, user?.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-events"] });
      toast.success("Événement créé avec succès");
      setDialogOpen(false);
    },
    onError: (error) => {
      toast.error("Erreur lors de la création");
    },
  });

  // Delete event mutation
  const deleteEventMutation = useMutation({
    mutationFn: (id: string) => adminQueries.deleteEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-events"] });
      toast.success("Événement supprimé");
    },
    onError: (error) => {
      toast.error("Erreur lors de la suppression");
    }
  });

  const upcomingEvents = events.filter((e) => isFuture(new Date(e.start_date)));
  const todayEvents = events.filter((e) => isToday(new Date(e.start_date)));

  return (
    <div className="space-y-6">
      <EventHeader onAddClick={() => setDialogOpen(true)} />

      <EventStats
        totalEvents={events.length}
        upcomingCount={upcomingEvents.length}
        todayCount={todayEvents.length}
        registrationCount={registrations.length}
      />

      <EventGrid
        events={events}
        registrations={registrations}
        onDelete={(id) => deleteEventMutation.mutate(id)}
        filterType={filterType}
        onFilterChange={setFilterType}
      />

      <EventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={(values) => createEventMutation.mutate(values)}
      />
    </div>
  );
}
