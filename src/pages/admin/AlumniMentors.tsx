import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { adminQueries } from "@/queries/admin";

// Modular components
import { AlumniMentorHeader } from "@/components/admin/alumni/AlumniMentorHeader";
import { AlumniMentorStats } from "@/components/admin/alumni/AlumniMentorStats";
import { AlumniMentorCard } from "@/components/admin/alumni/AlumniMentorCard";
import { AlumniMentorDialog } from "@/components/admin/alumni/AlumniMentorDialog";
import { MentorshipRequestsTable } from "@/components/admin/alumni/MentorshipRequestsTable";

type MentorshipStatus = "PENDING" | "ACCEPTED" | "ACTIVE" | "COMPLETED" | "CANCELLED";

const AlumniMentors = () => {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("mentors");
  const [searchTerm, setSearchTerm] = useState("");
  const [showMentorDialog, setShowMentorDialog] = useState(false);
  const [editingMentor, setEditingMentor] = useState<any>(null);

  // Queries
  const { data: mentors = [], isLoading: mentorsLoading } = useQuery({
    ...adminQueries.alumniMentors(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const { data: mentorshipRequests = [], isLoading: requestsLoading } = useQuery({
    ...adminQueries.mentorshipRequests(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  // Mutations
  const saveMentorMutation = useMutation({
    mutationFn: async (mentorData: any) => {
      if (!tenant?.id) throw new Error("No tenant");

      const payload = {
        ...mentorData,
        tenant_id: tenant.id,
        graduation_year: mentorData.graduation_year ? parseInt(mentorData.graduation_year) : null,
        max_mentees: parseInt(mentorData.max_mentees) || 3,
      };

      if (editingMentor?.id) {
        const { error } = await supabase
          .from("alumni_mentors")
          .update(payload)
          .eq("id", editingMentor.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("alumni_mentors").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-alumni-mentors", tenant?.id] });
      setShowMentorDialog(false);
      setEditingMentor(null);
      toast.success(editingMentor ? "Mentor mis à jour" : "Mentor ajouté avec succès");
    },
    onError: (error) => {
      toast.error("Erreur lors de la sauvegarde");
      console.error(error);
    },
  });

  const deleteMentorMutation = useMutation({
    mutationFn: async (mentorId: string) => {
      const { error } = await supabase.from("alumni_mentors").delete().eq("id", mentorId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-alumni-mentors", tenant?.id] });
      toast.success("Mentor supprimé");
    },
  });

  const updateRequestMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: MentorshipStatus }) => {
      const updateData: any = { status, updated_at: new Date().toISOString() };
      if (status === "ACTIVE") {
        updateData.started_at = new Date().toISOString();
      } else if (status === "COMPLETED" || status === "CANCELLED") {
        updateData.ended_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("mentorship_requests")
        .update(updateData)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-mentorship-requests", tenant?.id] });
      toast.success("Statut mis à jour");
    },
  });

  const handleEditMentor = (mentor: any) => {
    setEditingMentor(mentor);
    setShowMentorDialog(true);
  };

  const filteredMentors = mentors.filter((mentor: any) =>
    `${mentor.first_name} ${mentor.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    mentor.current_company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    mentor.industry?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const availableMentors = mentors.filter((m: any) => m.is_available).length;
  const activeMentorships = mentorshipRequests.filter((r: any) => r.status === "ACTIVE").length;
  const pendingRequests = mentorshipRequests.filter((r: any) => r.status === "PENDING").length;

  if (mentorsLoading || requestsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AlumniMentorHeader />

      <AlumniMentorStats
        totalMentors={mentors.length}
        availableMentors={availableMentors}
        activeMentorships={activeMentorships}
        pendingRequests={pendingRequests}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="mentors">Mentors</TabsTrigger>
          <TabsTrigger value="requests">Demandes de mentorat</TabsTrigger>
        </TabsList>

        <TabsContent value="mentors" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un mentor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button onClick={() => setShowMentorDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Ajouter un mentor
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMentors.map((mentor: any) => (
              <AlumniMentorCard
                key={mentor.id}
                mentor={mentor}
                onEdit={handleEditMentor}
                onDelete={(id) => deleteMentorMutation.mutate(id)}
              />
            ))}
            {filteredMentors.length === 0 && (
              <Card className="col-span-full">
                <CardContent className="py-8 text-center text-muted-foreground">
                  Aucun mentor trouvé
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="requests" className="space-y-4">
          <MentorshipRequestsTable
            requests={mentorshipRequests}
            onStatusChange={(id, status) => updateRequestMutation.mutate({ id, status })}
          />
        </TabsContent>
      </Tabs>

      <AlumniMentorDialog
        open={showMentorDialog}
        onOpenChange={setShowMentorDialog}
        onSubmit={(data) => saveMentorMutation.mutate(data)}
        editingMentor={editingMentor}
      />
    </div>
  );
};

export default AlumniMentors;
