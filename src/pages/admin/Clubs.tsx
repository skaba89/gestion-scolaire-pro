import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { adminQueries } from "@/queries/admin";

// Modular components
import { ClubsHeader } from "@/components/admin/clubs/ClubsHeader";
import { ClubsStats } from "@/components/admin/clubs/ClubsStats";
import { ClubCard } from "@/components/admin/clubs/ClubCard";
import { ClubCreateDialog } from "@/components/admin/clubs/ClubCreateDialog";
import { ClubMembersDialog } from "@/components/admin/clubs/ClubMembersDialog";

import {
  Users,
  Music,
  Palette,
  BookOpen,
  Code,
  Dumbbell,
  Theater,
  Camera,
  Loader2
} from "lucide-react";

const CLUB_CATEGORIES: Record<string, { label: string; icon: any; color: string }> = {
  sports: { label: "Sports", icon: Dumbbell, color: "bg-green-500/10 text-green-600" },
  arts: { label: "Arts", icon: Palette, color: "bg-purple-500/10 text-purple-600" },
  music: { label: "Musique", icon: Music, color: "bg-pink-500/10 text-pink-600" },
  academic: { label: "Académique", icon: BookOpen, color: "bg-blue-500/10 text-blue-600" },
  technology: { label: "Technologie", icon: Code, color: "bg-cyan-500/10 text-cyan-600" },
  theater: { label: "Théâtre", icon: Theater, color: "bg-orange-500/10 text-orange-600" },
  photography: { label: "Photo", icon: Camera, color: "bg-yellow-500/10 text-yellow-600" },
  other: { label: "Autre", icon: Users, color: "bg-gray-500/10 text-gray-600" },
};

export default function Clubs() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedClub, setSelectedClub] = useState<any | null>(null);

  // Queries
  const { data: clubs = [], isLoading: isClubsLoading } = useQuery({
    ...adminQueries.adminClubs(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const { data: memberships = [], isLoading: isMembershipsLoading } = useQuery({
    ...adminQueries.clubMemberships(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const { data: students = [] } = useQuery({
    ...adminQueries.studentsForClubs(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  // Mutations
  const createClubMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiClient.post("/clubs/", {
        tenant_id: tenant!.id,
        name: data.name,
        description: data.description || null,
        category: data.category,
        meeting_schedule: data.meeting_schedule || null,
        max_members: data.max_members ? parseInt(data.max_members) : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-clubs", tenant?.id] });
      toast.success("Club créé avec succès");
      setCreateDialogOpen(false);
    },
    onError: () => toast.error("Erreur lors de la création"),
  });

  const deleteClubMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/clubs/${id}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-clubs", tenant?.id] });
      toast.success("Club supprimé");
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async ({ clubId, studentId }: { clubId: string; studentId: string }) => {
      await apiClient.post("/clubs/memberships/", {
        tenant_id: tenant!.id,
        club_id: clubId,
        student_id: studentId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-club-memberships", tenant?.id] });
      toast.success("Membre ajouté");
    },
    onError: () => toast.error("Erreur lors de l'ajout"),
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/clubs/memberships/${id}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-club-memberships", tenant?.id] });
      toast.success("Membre retiré");
    },
  });

  const getMemberCount = (clubId: string) => {
    return memberships.filter((m: any) => m.club_id === clubId).length;
  };

  const getClubMembers = (clubId: string) => {
    return memberships.filter((m: any) => m.club_id === clubId);
  };

  const getNonMembers = (clubId: string) => {
    const memberIds = memberships.filter((m: any) => m.club_id === clubId).map((m: any) => m.student_id);
    return students.filter((s: any) => !memberIds.includes(s.id));
  };

  if (isClubsLoading || isMembershipsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ClubsHeader onOpenCreateDialog={() => setCreateDialogOpen(true)} />

      <ClubsStats
        totalClubs={clubs.length}
        totalMemberships={memberships.length}
        sportsClubs={clubs.filter((c: any) => c.category === "sports").length}
        artsClubs={clubs.filter((c: any) => c.category === "arts" || c.category === "music").length}
      />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clubs.map((club: any) => (
          <ClubCard
            key={club.id}
            club={club}
            memberCount={getMemberCount(club.id)}
            members={getClubMembers(club.id)}
            categoryConfig={CLUB_CATEGORIES[club.category] || CLUB_CATEGORIES.other}
            onDelete={(id) => deleteClubMutation.mutate(id)}
            onManageMembers={setSelectedClub}
          />
        ))}
        {clubs.length === 0 && (
          <div className="col-span-full border-2 border-dashed rounded-lg py-12 text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-medium text-lg">Aucun club</h3>
            <p className="text-muted-foreground">Créez votre premier club étudiant</p>
          </div>
        )}
      </div>

      <ClubCreateDialog
        isOpen={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={(data) => createClubMutation.mutate(data)}
        isPending={createClubMutation.isPending}
        categories={CLUB_CATEGORIES}
      />

      <ClubMembersDialog
        club={selectedClub}
        isOpen={!!selectedClub}
        onOpenChange={(open) => !open && setSelectedClub(null)}
        members={selectedClub ? getClubMembers(selectedClub.id) : []}
        nonMembers={selectedClub ? getNonMembers(selectedClub.id) : []}
        onAddMember={(studentId) => addMemberMutation.mutate({ clubId: selectedClub.id, studentId })}
        onRemoveMember={(id) => removeMemberMutation.mutate(id)}
      />
    </div>
  );
}
