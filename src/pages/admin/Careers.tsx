import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { adminQueries } from "@/queries/admin";
import { CareersHeader } from "@/components/admin/careers/CareersHeader";
import { CareersStats } from "@/components/admin/careers/CareersStats";
import { OfferView } from "@/components/admin/careers/OfferView";
import { ApplicationView } from "@/components/admin/careers/ApplicationView";
import { EventView } from "@/components/admin/careers/EventView";
import { OfferDialog } from "@/components/admin/careers/OfferDialog";
import { EventDialog } from "@/components/admin/careers/EventDialog";

export default function Careers() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("offers");
  const [searchTerm, setSearchTerm] = useState("");

  const [offerDialogOpen, setOfferDialogOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<any>(null);

  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  // Queries
  const { data: offers = [] } = useQuery(adminQueries.careersOffers(tenant?.id || ""));
  const { data: applications = [] } = useQuery(adminQueries.careersApplications(tenant?.id || ""));
  const { data: events = [] } = useQuery(adminQueries.careersEvents(tenant?.id || ""));
  const { data: registrations = [] } = useQuery(adminQueries.careersEventRegistrations(tenant?.id || ""));

  // Mutations
  const offerMutation = useMutation({
    mutationFn: async (data: any) => {
      if (selectedOffer) {
        const { error } = await supabase
          .from("job_offers")
          .update(data)
          .eq("id", selectedOffer.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("job_offers")
          .insert({ ...data, tenant_id: tenant?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-job-offers"] });
      setOfferDialogOpen(false);
      setSelectedOffer(null);
      toast.success(selectedOffer ? "Offre mise à jour" : "Offre créée");
    },
    onError: (error: any) => toast.error("Erreur: " + error.message),
  });

  const deleteOfferMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("job_offers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-job-offers"] });
      toast.success("Offre supprimée");
    },
  });

  const eventMutation = useMutation({
    mutationFn: async (data: any) => {
      if (selectedEvent) {
        const { error } = await supabase
          .from("career_events")
          .update(data)
          .eq("id", selectedEvent.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("career_events")
          .insert({ ...data, tenant_id: tenant?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-career-events"] });
      setEventDialogOpen(false);
      setSelectedEvent(null);
      toast.success(selectedEvent ? "Événement mis à jour" : "Événement créé");
    },
    onError: (error: any) => toast.error("Erreur: " + error.message),
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("career_events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-career-events"] });
      toast.success("Événement supprimé");
    },
  });

  const updateAppStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("job_applications")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-job-applications"] });
      toast.success("Statut mis à jour");
    },
  });

  const getRegistrationCount = (eventId: string) => {
    return registrations.filter((r: any) => r.event_id === eventId).length;
  };

  const stats = {
    activeOffers: offers.filter((o: any) => o.is_active).length,
    totalApplications: applications.length,
    pendingApplications: applications.filter((a: any) => a.status === "PENDING").length,
    upcomingEvents: events.filter((e: any) => new Date(e.start_datetime) > new Date()).length,
    totalOffers: offers.length,
  };

  return (
    <div className="space-y-6">
      <CareersHeader
        activeTab={activeTab}
        onNewOffer={() => {
          setSelectedOffer(null);
          setOfferDialogOpen(true);
        }}
        onNewEvent={() => {
          setSelectedEvent(null);
          setEventDialogOpen(true);
        }}
      />

      <CareersStats {...stats} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="offers">Offres</TabsTrigger>
          <TabsTrigger value="applications">Candidatures</TabsTrigger>
          <TabsTrigger value="events">Événements</TabsTrigger>
        </TabsList>

        <TabsContent value="offers">
          <OfferView
            offers={offers}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onEdit={(offer) => {
              setSelectedOffer(offer);
              setOfferDialogOpen(true);
            }}
            onDelete={(id) => {
              if (confirm("Supprimer cette offre ?")) {
                deleteOfferMutation.mutate(id);
              }
            }}
          />
        </TabsContent>

        <TabsContent value="applications">
          <ApplicationView
            applications={applications}
            onUpdateStatus={(id, status) => updateAppStatusMutation.mutate({ id, status })}
          />
        </TabsContent>

        <TabsContent value="events">
          <EventView
            events={events}
            onEdit={(event) => {
              setSelectedEvent(event);
              setEventDialogOpen(true);
            }}
            onDelete={(id) => {
              if (confirm("Supprimer cet événement ?")) {
                deleteEventMutation.mutate(id);
              }
            }}
            getRegistrationCount={getRegistrationCount}
          />
        </TabsContent>
      </Tabs>

      <OfferDialog
        isOpen={offerDialogOpen}
        onOpenChange={(open) => {
          setOfferDialogOpen(open);
          if (!open) setSelectedOffer(null);
        }}
        offer={selectedOffer}
        onSubmit={(data) => offerMutation.mutate(data)}
        isPending={offerMutation.isPending}
      />

      <EventDialog
        isOpen={eventDialogOpen}
        onOpenChange={(open) => {
          setEventDialogOpen(open);
          if (!open) setSelectedEvent(null);
        }}
        event={selectedEvent}
        onSubmit={(data) => eventMutation.mutate(data)}
        isPending={eventMutation.isPending}
      />
    </div>
  );
}
