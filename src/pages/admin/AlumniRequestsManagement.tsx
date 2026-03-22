import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { adminQueries } from "@/queries/admin";
import { useCreateNotification } from "@/hooks/useNotifications";

// Modular components
import { AlumniRequestsHeader } from "@/components/admin/alumni/AlumniRequestsHeader";
import { AlumniRequestsStats } from "@/components/admin/alumni/AlumniRequestsStats";
import { AlumniRequestsFilters } from "@/components/admin/alumni/AlumniRequestsFilters";
import { AlumniRequestsTable } from "@/components/admin/alumni/AlumniRequestsTable";
import { AlumniRequestDetailDialog } from "@/components/admin/alumni/AlumniRequestDetailDialog";

import { Loader2, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

const DOCUMENT_TYPES = [
  { value: "transcript", label: "Relevé de notes" },
  { value: "diploma", label: "Diplôme" },
  { value: "certificate", label: "Certificat de scolarité" },
  { value: "attestation", label: "Attestation" },
  { value: "other", label: "Autre document" },
];

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "En attente", color: "bg-yellow-100 text-yellow-800", icon: <Clock className="w-3 h-3" /> },
  in_progress: { label: "En cours", color: "bg-blue-100 text-blue-800", icon: <Loader2 className="w-3 h-3" /> },
  awaiting_validation: { label: "En validation", color: "bg-purple-100 text-purple-800", icon: <AlertCircle className="w-3 h-3" /> },
  validated: { label: "Validé", color: "bg-green-100 text-green-800", icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected: { label: "Rejeté", color: "bg-red-100 text-red-800", icon: <XCircle className="w-3 h-3" /> },
  completed: { label: "Terminé", color: "bg-emerald-100 text-emerald-800", icon: <CheckCircle2 className="w-3 h-3" /> },
  cancelled: { label: "Annulé", color: "bg-gray-100 text-gray-800", icon: <XCircle className="w-3 h-3" /> },
};

export default function AlumniRequestsManagement() {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const notify = useCreateNotification();

  // Queries
  const { data: requests = [], isLoading: isRequestsLoading } = useQuery({
    ...adminQueries.alumniDocumentRequests(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const { data: profiles = [], isLoading: isProfilesLoading } = useQuery({
    ...adminQueries.alumniProfilesForRequests(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const { data: staffMembers = [] } = useQuery({
    ...adminQueries.adminStaffMembers(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const { data: requestHistory = [], refetch: refetchHistory } = useQuery({
    ...adminQueries.alumniRequestHistory(selectedRequest?.id || ""),
    enabled: !!selectedRequest?.id,
  });

  // Profiles lookup map
  const profilesMap = useMemo(() => {
    const map: Record<string, any> = {};
    profiles.forEach((p: any) => {
      map[p.id] = p;
    });
    return map;
  }, [profiles]);

  // Mutations
  const updateRequestMutation = useMutation({
    mutationFn: async ({ requestId, updates, action, notes }: any) => {
      const { error } = await supabase
        .from("alumni_document_requests")
        .update(updates)
        .eq("id", requestId);

      if (error) throw error;

      await supabase.from("alumni_request_history").insert({
        request_id: requestId,
        action,
        previous_status: selectedRequest?.status,
        new_status: updates.status || selectedRequest?.status,
        performed_by: user?.id,
        notes,
      });

      if (updates.status && ["validated", "rejected", "completed"].includes(updates.status)) {
        await notify.mutateAsync({
          userId: selectedRequest?.alumni_id,
          title: `Mise à jour de votre demande`,
          message: `Votre demande de ${DOCUMENT_TYPES.find(t => t.value === selectedRequest?.document_type)?.label} a été ${STATUS_LABELS[updates.status]?.label.toLowerCase()}`,
          type: "alert", // closest match to document_request in sovereign types
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-alumni-requests", tenant?.id] });
      refetchHistory();
      toast.success("Demande mise à jour");
    },
  });

  const handleAction = (action: string, notes?: string, approved?: boolean) => {
    if (!selectedRequest) return;

    let updates: any = {};
    let historyAction = "status_changed";

    switch (action) {
      case "start":
        updates = { status: "in_progress" };
        break;
      case "request_validation":
        updates = { status: "awaiting_validation", secretariat_notes: notes };
        historyAction = "validation_requested";
        break;
      case "validate":
        updates = {
          status: approved ? "validated" : "rejected",
          validation_status: approved ? "approved" : "rejected",
          validation_notes: notes,
          validated_at: new Date().toISOString(),
          validator_id: user?.id,
        };
        historyAction = approved ? "validated" : "rejected";
        break;
      case "complete":
        updates = { status: "completed", delivered_at: new Date().toISOString() };
        historyAction = "completed";
        break;
    }

    updateRequestMutation.mutate({
      requestId: selectedRequest.id,
      updates,
      action: historyAction,
      notes,
    });
  };

  const filteredRequests = requests.filter((request: any) => {
    if (statusFilter !== "all" && request.status !== statusFilter) return false;
    if (searchQuery) {
      const search = searchQuery.toLowerCase();
      const alumni = profilesMap[request.alumni_id];
      return (
        alumni?.first_name?.toLowerCase().includes(search) ||
        alumni?.last_name?.toLowerCase().includes(search) ||
        alumni?.email?.toLowerCase().includes(search) ||
        request.document_type?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  const stats = {
    pending: requests.filter((r: any) => r.status === "pending").length,
    inProgress: requests.filter((r: any) => r.status === "in_progress").length,
    awaitingValidation: requests.filter((r: any) => r.status === "awaiting_validation").length,
    completed: requests.filter((r: any) => r.status === "completed").length,
  };

  if (isRequestsLoading || isProfilesLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AlumniRequestsHeader />

      <AlumniRequestsStats stats={stats} />

      <AlumniRequestsFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusLabels={STATUS_LABELS}
      />

      <AlumniRequestsTable
        requests={filteredRequests}
        profilesMap={profilesMap}
        staffMembers={staffMembers}
        onAssign={(requestId, staffId) => updateRequestMutation.mutate({
          requestId,
          updates: { assigned_to: staffId, status: "in_progress" },
          action: "assigned",
          notes: "Demande assignée",
        })}
        onViewDetails={setSelectedRequest}
        statusLabels={STATUS_LABELS}
        documentTypes={DOCUMENT_TYPES}
      />

      <AlumniRequestDetailDialog
        request={selectedRequest}
        onClose={() => setSelectedRequest(null)}
        profilesMap={profilesMap}
        documentTypes={DOCUMENT_TYPES}
        statusLabels={STATUS_LABELS}
        requestHistory={requestHistory}
        onAction={handleAction}
      />
    </div>
  );
}
