import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { apiClient } from "@/api/client";
import { IncidentDialog } from "@/components/admin/incidents/IncidentDialog";
import { IncidentHeader } from "@/components/admin/incidents/IncidentHeader";
import {
  IncidentResolveDialog,
  type IncidentResolution,
} from "@/components/admin/incidents/IncidentResolveDialog";
import { IncidentStats } from "@/components/admin/incidents/IncidentStats";
import { IncidentTable } from "@/components/admin/incidents/IncidentTable";
import {
  type IncidentFormData,
  type IncidentRecord,
  normalizeIncidentStatus,
} from "@/components/admin/incidents/incidentTypes";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTenant } from "@/contexts/TenantContext";
import { adminQueries } from "@/queries/admin";

export default function Incidents() {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [resolvingIncidentId, setResolvingIncidentId] = useState<string | null>(null);

  const { data: incidents = [] } = useQuery(
    adminQueries.adminIncidents(tenant?.id || ""),
  );

  const createMutation = useMutation({
    mutationFn: async (data: IncidentFormData) => {
      await apiClient.post("/incidents/", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-incidents"] });
      setIsOpen(false);
      toast.success(t("incidents.reportSuccess"));
    },
    onError: () => toast.error(t("incidents.reportError")),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiClient.put(`/incidents/${id}/`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-incidents"] });
      toast.success(t("incidents.statusUpdateSuccess"));
    },
    onError: () => toast.error(t("incidents.reportError")),
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: IncidentResolution }) => {
      await apiClient.put(`/incidents/${id}/resolve/`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-incidents"] });
      setResolvingIncidentId(null);
      toast.success(t("incidents.statusUpdateSuccess"));
    },
    onError: () => toast.error(t("incidents.reportError")),
  });

  const incidentList = incidents as IncidentRecord[];
  const openIncidents = incidentList.filter((incident) =>
    ["open", "reported", "investigating", "assigned", "action_taken"].includes(
      normalizeIncidentStatus(incident.status),
    ));
  const closedIncidents = incidentList.filter((incident) =>
    ["resolved", "closed"].includes(normalizeIncidentStatus(incident.status)));

  const stats = {
    total: incidentList.length,
    open: openIncidents.length,
    critical: incidentList.filter((incident) =>
      String(incident.severity).toLowerCase() === "critical"
      && !["resolved", "closed"].includes(normalizeIncidentStatus(incident.status))).length,
    thisWeek: incidentList.filter((incident) => {
      const date = new Date(incident.occurred_at);
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
          <TabsTrigger value="open">{t("incidents.tabOpen")} ({openIncidents.length})</TabsTrigger>
          <TabsTrigger value="closed">{t("incidents.tabClosed")} ({closedIncidents.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="open">
          <IncidentTable
            incidents={openIncidents}
            onUpdateStatus={(id, status) => updateStatusMutation.mutate({ id, status })}
            onResolve={setResolvingIncidentId}
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
        tenantId={tenant?.id || ""}
      />
      <IncidentResolveDialog
        open={Boolean(resolvingIncidentId)}
        onOpenChange={(open) => !open && setResolvingIncidentId(null)}
        onSubmit={(payload) => {
          if (resolvingIncidentId) {
            resolveMutation.mutate({ id: resolvingIncidentId, payload });
          }
        }}
        isPending={resolveMutation.isPending}
      />
    </div>
  );
}
