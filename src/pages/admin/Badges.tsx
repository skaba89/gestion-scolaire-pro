import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { QrCode, History } from "lucide-react";

import { adminQueries } from "@/queries/admin";
import { useStudentLabel } from "@/hooks/useStudentLabel";

// Modular components
import { BadgeHeader } from "@/components/admin/badges/BadgeHeader";
import { BadgeStats } from "@/components/admin/badges/BadgeStats";
import { BadgeFilters } from "@/components/admin/badges/BadgeFilters";
import { BadgeTable } from "@/components/admin/badges/BadgeTable";
import { BadgeCreateDialog } from "@/components/admin/badges/BadgeCreateDialog";
import { BadgeDetailDialog } from "@/components/admin/badges/BadgeDetailDialog";

import QRScanner from "@/components/badges/QRScanner";
import CheckInHistory from "@/components/badges/CheckInHistory";
import { BadgeRenderer } from "@/components/badges/BadgeTemplates";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  INACTIVE: "bg-gray-100 text-gray-800",
  LOST: "bg-red-100 text-red-800",
  EXPIRED: "bg-yellow-100 text-yellow-800",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Actif",
  INACTIVE: "Inactif",
  LOST: "Perdu",
  EXPIRED: "Expiré",
};

export default function BadgesPage() {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const { studentLabel, StudentLabel, studentsLabel, StudentsLabel } = useStudentLabel();

  const [searchTerm, setSearchTerm] = useState("");
  const [classroomFilter, setClassroomFilter] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<any | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Queries
  const { data: badges = [], isLoading: isBadgesLoading, refetch: refetchBadges } = useQuery({
    ...adminQueries.studentBadgesDetailed(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const { data: classrooms = [] } = useQuery({
    ...adminQueries.classrooms(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const { data: studentsWithoutBadge = [] } = useQuery({
    ...adminQueries.studentsWithoutBadges(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  // Handlers
  const handleCreateBadge = async (selectedStudent: string) => {
    if (!selectedStudent || !tenant) return;

    const generateBadgeCode = () => {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let code = "";
      for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    };

    const badgeCode = generateBadgeCode();
    const qrCodeData = JSON.stringify({
      type: "student_badge",
      tenant_id: tenant.id,
      student_id: selectedStudent,
      badge_code: badgeCode,
      version: 1,
    });

    const { error } = await supabase.from("student_badges").insert({
      student_id: selectedStudent,
      tenant_id: tenant.id,
      badge_code: badgeCode,
      qr_code_data: qrCodeData,
      status: "ACTIVE",
    });

    if (error) {
      console.error("Error creating badge:", error);
      toast.error("Impossible de créer le badge");
    } else {
      toast.success("Badge créé avec succès");
      setIsCreateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-student-badges", tenant.id] });
      queryClient.invalidateQueries({ queryKey: ["admin-students-without-badges", tenant.id] });
    }
  };

  const handleUpdateStatus = async (badgeId: string, newStatus: string) => {
    const { error } = await supabase
      .from("student_badges")
      .update({ status: newStatus })
      .eq("id", badgeId);

    if (error) {
      console.error("Error updating badge status:", error);
      toast.error("Impossible de mettre à jour le statut");
    } else {
      toast.success("Statut mis à jour");
      queryClient.invalidateQueries({ queryKey: ["admin-student-badges", tenant?.id] });
      if (selectedBadge && selectedBadge.id === badgeId) {
        setSelectedBadge({ ...selectedBadge, status: newStatus });
      }
    }
  };

  const handleDeleteBadge = async (badgeId: string) => {
    const { error } = await supabase
      .from("student_badges")
      .delete()
      .eq("id", badgeId);

    if (error) {
      console.error("Error deleting badge:", error);
      toast.error("Impossible de supprimer le badge");
    } else {
      toast.success("Badge supprimé définitivement");
      setSelectedBadge(null);
      queryClient.invalidateQueries({ queryKey: ["admin-student-badges", tenant?.id] });
      queryClient.invalidateQueries({ queryKey: ["admin-students-without-badges", tenant?.id] });
    }
  };

  const handleScanResult = async (qrData: string) => {
    try {
      const data = JSON.parse(qrData);

      if (data.type !== "student_badge" || data.tenant_id !== tenant?.id) {
        toast.error("Ce QR code n'est pas un badge valide pour cet établissement");
        return;
      }

      const badge = badges.find((b: any) => b.badge_code === data.badge_code);
      if (!badge) {
        toast.error("Ce badge n'existe pas dans le système");
        return;
      }

      if (badge.status !== "ACTIVE") {
        toast.error(`Ce badge est ${STATUS_LABELS[badge.status].toLowerCase()}`);
        return;
      }

      const { data: lastCheckIn } = await supabase
        .from("student_check_ins")
        .select("check_in_type")
        .eq("student_id", badge.student_id)
        .order("checked_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const checkInType = lastCheckIn?.check_in_type === "ENTRY" ? "EXIT" : "ENTRY";

      const { error } = await supabase.from("student_check_ins").insert({
        student_id: badge.student_id,
        badge_id: badge.id,
        tenant_id: tenant?.id,
        check_in_type: checkInType,
        checked_by: user?.id,
      });

      if (error) {
        console.error("Error creating check-in:", error);
        toast.error("Impossible d'enregistrer le pointage");
      } else {
        toast.success(
          checkInType === "ENTRY" ? "Entrée enregistrée" : "Sortie enregistrée",
          { description: `${badge.student?.first_name} ${badge.student?.last_name}` }
        );
      }
    } catch (e) {
      console.error("Error parsing QR code:", e);
      toast.error("Impossible de lire ce QR code");
    }
  };

  const downloadBadge = async (badge: any) => {
    const svg = document.getElementById(`qr-${badge.id}`);
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = 400;
    canvas.height = 600;

    if (!ctx) return;

    // White background
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Border
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, 380, 580);

    // School name
    ctx.fillStyle = "#3b82f6";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.fillText(tenant?.name || "École", 200, 40);

    const photoY = 55;
    // Draw initials (fallback for simplicity in canvas generation)
    ctx.fillStyle = "#e0e7ff";
    ctx.beginPath();
    ctx.arc(200, photoY + 40, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3b82f6";
    ctx.font = "bold 28px Arial";
    ctx.fillText(
      `${badge.student?.first_name?.[0] || ""}${badge.student?.last_name?.[0] || ""}`,
      200, photoY + 50
    );

    // Draw QR code
    const qrImg = new Image();
    await new Promise<void>((resolve) => {
      qrImg.onload = () => {
        ctx.drawImage(qrImg, 75, 150, 250, 250);
        resolve();
      };
      qrImg.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
    });

    // Student name
    ctx.fillStyle = "black";
    ctx.font = "bold 22px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`${badge.student?.last_name?.toUpperCase() || ""} ${badge.student?.first_name || ""}`, 200, 430);

    if (badge.student?.registration_number) {
      ctx.font = "14px Arial";
      ctx.fillStyle = "#666";
      ctx.fillText(`Mat: ${badge.student.registration_number}`, 200, 455);
    }

    if (badge.classroomName) {
      ctx.font = "bold 16px Arial";
      ctx.fillStyle = "#3b82f6";
      ctx.fillText(badge.classroomName, 200, 480);
    }

    if (badge.academicYear) {
      ctx.font = "14px Arial";
      ctx.fillStyle = "#666";
      ctx.fillText(badge.academicYear, 200, 505);
    }

    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(100, 520, 200, 30);
    ctx.fillStyle = "black";
    ctx.font = "bold 16px monospace";
    ctx.fillText(badge.badge_code, 200, 542);

    const link = document.createElement("a");
    link.download = `badge-${badge.student?.last_name}-${badge.badge_code}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const filteredBadges = useMemo(() => {
    return badges.filter((badge: any) => {
      const studentName = `${badge.student?.first_name} ${badge.student?.last_name}`.toLowerCase();
      const search = searchTerm.toLowerCase();
      const matchesSearch = studentName.includes(search) ||
        badge.badge_code.toLowerCase().includes(search) ||
        badge.student?.registration_number?.toLowerCase().includes(search) ||
        badge.classroomName?.toLowerCase().includes(search);

      const matchesClassroom = classroomFilter === "all" ||
        badge.classroomId === classroomFilter ||
        (classroomFilter === "none" && !badge.classroomName);

      return matchesSearch && matchesClassroom;
    });
  }, [badges, searchTerm, classroomFilter]);

  const groupedBadges = useMemo(() => {
    const paginated = filteredBadges.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    return paginated.reduce((acc: any, badgeByClass: any) => {
      const classroom = badgeByClass.classroomName || "Sans classe";
      if (!acc[classroom]) acc[classroom] = [];
      acc[classroom].push(badgeByClass);
      return acc;
    }, {} as Record<string, any[]>);
  }, [filteredBadges, currentPage, pageSize]);

  const sortedClassrooms = useMemo(() => {
    return Object.keys(groupedBadges).sort((a, b) => {
      if (a === "Sans classe") return 1;
      if (b === "Sans classe") return -1;
      return a.localeCompare(b);
    });
  }, [groupedBadges]);

  if (isBadgesLoading) {
    return <div className="flex items-center justify-center py-12">Chargement...</div>;
  }

  return (
    <div className="space-y-6">
      <BadgeHeader
        studentsLabel={studentsLabel}
        studentLabel={studentLabel}
        onRefresh={() => {
          queryClient.invalidateQueries({ queryKey: ["admin-student-badges"] });
          queryClient.invalidateQueries({ queryKey: ["admin-students-without-badges"] });
        }}
        onShowScanner={() => setShowScanner(true)}
        onOpenCreateDialog={() => setIsCreateDialogOpen(true)}
      />

      <BadgeStats
        totalBadges={badges.length}
        activeBadges={badges.filter((b: any) => b.status === "ACTIVE").length}
        inactiveBadges={badges.filter((b: any) => b.status !== "ACTIVE").length}
        withoutBadge={studentsWithoutBadge.length}
      />

      <Tabs defaultValue="badges" className="space-y-4">
        <TabsList>
          <TabsTrigger value="badges">
            <QrCode className="h-4 w-4 mr-2" />
            Badges
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-2" />
            Historique Pointages
          </TabsTrigger>
        </TabsList>

        <TabsContent value="badges" className="space-y-4">
          <Card>
            <CardHeader>
              <BadgeFilters
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                classroomFilter={classroomFilter}
                onClassroomFilterChange={setClassroomFilter}
                classrooms={classrooms}
              />
            </CardHeader>
            <CardContent>
              {filteredBadges.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">Aucun badge trouvé</div>
              ) : (
                <div className="space-y-6">
                  {sortedClassrooms.map((classroomName) => (
                    <div key={classroomName} className="space-y-2">
                      <div className="flex items-center gap-2 px-2 py-1 bg-muted/50 rounded-md">
                        <span className="font-semibold text-sm">{classroomName}</span>
                        <span className="text-xs text-muted-foreground">({groupedBadges[classroomName].length})</span>
                      </div>
                      <BadgeTable
                        badges={groupedBadges[classroomName]}
                        onSelect={setSelectedBadge}
                        onUpdateStatus={handleUpdateStatus}
                        onDelete={handleDeleteBadge}
                        statusLabels={STATUS_LABELS}
                        statusColors={STATUS_COLORS}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <CheckInHistory />
        </TabsContent>
      </Tabs>

      <BadgeCreateDialog
        isOpen={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        studentsWithoutBadge={studentsWithoutBadge}
        studentLabel={studentLabel}
        studentsLabel={studentsLabel}
        StudentLabel={StudentLabel}
        onCreate={handleCreateBadge}
      />

      <BadgeDetailDialog
        badge={selectedBadge}
        onClose={() => setSelectedBadge(null)}
        onUpdateStatus={handleUpdateStatus}
        onDelete={handleDeleteBadge}
        onDownload={downloadBadge}
        statusLabels={STATUS_LABELS}
        statusColors={STATUS_COLORS}
      />

      {showScanner && (
        <QRScanner
          onScan={handleScanResult}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
