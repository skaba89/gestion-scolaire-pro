import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { adminQueries } from "@/queries/admin";
import { IncidentHeader } from "@/components/admin/incidents/IncidentHeader";
import { IncidentStats } from "@/components/admin/incidents/IncidentStats";
import { IncidentTable } from "@/components/admin/incidents/IncidentTable";
import { IncidentDialog } from "@/components/admin/incidents/IncidentDialog";

export default function Incidents() {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  // Query
  const { data: incidents = [], isLoading } = useQuery(adminQueries.adminIncidents(tenant?.id || ""));

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const incidentNumber = `INC-${Date.now().toString(36).toUpperCase()}`;

      const { error } = await supabase
        .from("incidents")
        .insert({
          tenant_id: tenant?.id,
          incident_number: incidentNumber,
          incident_type: data.incident_type,
          severity: data.severity,
          title: data.title,
          description: data.description,
          location: data.location,
          occurred_at: data.occurred_at,
          reported_by: user?.id,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-incidents"] });
      setIsOpen(false);
      toast.success("Incident signalé");
    },
    onError: () => toast.error("Erreur lors du signalement"),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === "resolved" || status === "closed") {
        updates.resolved_by = user?.id;
        updates.resolved_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("incidents")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-incidents"] });
      toast.success("Statut mis à jour");
    },
  });

  const openIncidents = incidents.filter((i: any) => ["reported", "investigating", "action_taken"].includes(i.status));
  const closedIncidents = incidents.filter((i: any) => ["resolved", "closed"].includes(i.status));

  const stats = {
    total: incidents.length,
    open: openIncidents.length,
    critical: incidents.filter((i: any) => i.severity === "critical" && !["resolved", "closed"].includes(i.status)).length,
    thisWeek: incidents.filter((i: any) => {
      const date = new Date(i.occurred_at);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return date > weekAgo;
    }).length,
  };

  return (
    <div className="space-y-6">
      <IncidentHeader onReportIncident={() => setIsOpen(true)} />

      <IncidentStats {...stats} />

      <Tabs defaultValue="open" className="space-y-4">
        <TabsList>
          <TabsTrigger value="open">En cours ({openIncidents.length})</TabsTrigger>
          <TabsTrigger value="closed">Clôturés ({closedIncidents.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="open">
          <IncidentTable
            incidents={openIncidents}
            onUpdateStatus={(id, status) => updateStatusMutation.mutate({ id, status })}
          />
        </TabsContent>

        <TabsContent value="closed">
          <IncidentTable
            incidents={closedIncidents}
            onUpdateStatus={(id, status) => updateStatusMutation.mutate({ id, status })}
            showActions={false}
          />
        </TabsContent>
      </Tabs>

      <IncidentDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
      />
    </div>
  );
}
