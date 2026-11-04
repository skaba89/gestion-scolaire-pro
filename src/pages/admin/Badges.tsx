import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { apiClient } from "@/api/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { QrCode, History } from "lucide-react";

import { adminQueries } from "@/queries/admin";
import {
  type CardBadge,
  cardToBadge,
  issueStudentCards,
  listStudentCards,
  resolveScannedCard,
  revokeStudentCard,
} from "@/features/students/utils/studentCards";
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

export default function BadgesPage() {
  const { t } = useTranslation();

  // Une carte existe (ACTIVE) ou n'existe pas. Les autres entrées du sélecteur
  // sont des ACTIONS réelles : déclarer perdue = nouveau code (l'ancienne carte
  // ne fonctionne plus), retirer = plus de code.
  const STATUS_LABELS: Record<string, string> = {
    ACTIVE: t("badges.statusActive"),
    LOST: t("badges.actionReissue"),
    INACTIVE: t("badges.actionRevoke"),
  };

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

  // Queries — cartes = code de la fiche élève (students.card_uid)
  const { data: cards = [], isLoading: isBadgesLoading, isError: isCardsError } = useQuery({
    queryKey: ["student-cards", tenant?.id, classroomFilter],
    queryFn: () => listStudentCards(classroomFilter !== "all" && classroomFilter !== "none" ? classroomFilter : undefined),
    enabled: !!tenant?.id,
  });
  const badges = useMemo(() => cards.map(cardToBadge).filter((b): b is CardBadge => b !== null), [cards]);
  const studentsWithoutBadge = useMemo(
    () => cards.filter((c) => !c.card_uid).map((c) => ({
      id: c.student_id, first_name: c.first_name, last_name: c.last_name, registration_number: c.registration_number,
    })),
    [cards],
  );
  const refreshCards = () => queryClient.invalidateQueries({ queryKey: ["student-cards"] });

  const { data: classrooms = [] } = useQuery({
    ...adminQueries.classrooms(tenant?.id || ""),
    enabled: !!tenant?.id,
  });


  // Handlers
  const handleCreateBadge = async (selectedStudent: string) => {
    if (!selectedStudent || !tenant) return;
    try {
      await issueStudentCards([selectedStudent]);
    } catch (error: any) {
      toast.error(error.response?.data?.detail || t("badges.badgeCreateError"));
      return;
    }
    toast.success(t("badges.badgeCreated"));
    setIsCreateDialogOpen(false);
    refreshCards();
  };

  const handleUpdateStatus = async (studentId: string, action: string) => {
    if (action === "ACTIVE") return;
    try {
      if (action === "LOST") {
        const [card] = await issueStudentCards([studentId], true);
        if (selectedBadge?.id === studentId && card) setSelectedBadge(cardToBadge(card));
        toast.success(t("badges.cardReissued"));
      } else {
        await revokeStudentCard(studentId);
        if (selectedBadge?.id === studentId) setSelectedBadge(null);
        toast.success(t("badges.badgeDeleted"));
      }
    } catch (error: any) {
      toast.error(error.response?.data?.detail || t("badges.statusUpdateError"));
      return;
    }
    refreshCards();
  };

  const handleDeleteBadge = async (studentId: string) => {
    try {
      await revokeStudentCard(studentId);
    } catch (error: any) {
      toast.error(error.response?.data?.detail || t("badges.badgeDeleteError"));
      return;
    }
    toast.success(t("badges.badgeDeleted"));
    setSelectedBadge(null);
    refreshCards();
  };

  const handleScanResult = async (qrData: string) => {
    // Le serveur résout le code — comme le scanner enseignant et la borne.
    let student: Awaited<ReturnType<typeof resolveScannedCard>>;
    try {
      student = await resolveScannedCard(qrData);
    } catch (error: any) {
      toast.error(error.response?.data?.detail || t("badges.qrReadError"));
      return;
    }
    if (!student) {
      toast.error(t("badges.badgeNotFound"));
      return;
    }

    let checkInType = "ENTRY";
    try {
      const { data: lastCheckIns } = await apiClient.get<any[]>("/school-life/check-ins/", {
        params: { student_ids: [student.student_id], limit: 1 }
      });
      checkInType = lastCheckIns?.[0]?.check_in_type === "ENTRY" ? "EXIT" : "ENTRY";
    } catch {
      // Aucun pointage précédent : entrée par défaut
    }

    try {
      await apiClient.post("/school-life/check-ins/", {
        student_id: student.student_id,
        tenant_id: tenant?.id,
        check_in_type: checkInType,
        checked_by: user?.id,
      });
    } catch (error: any) {
      toast.error(error.response?.data?.detail || t("badges.checkError"));
      return;
    }
    toast.success(
      checkInType === "ENTRY" ? t("badges.checkInRecorded") : t("badges.checkOutRecorded"),
      { description: `${student.first_name} ${student.last_name}` }
    );
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

      // Le filtre de classe est appliqué par le serveur (paramètre classroom_id).
      return matchesSearch;
    });
  }, [badges, searchTerm, classroomFilter]);

  const groupedBadges = useMemo(() => {
    const paginated = filteredBadges.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    return paginated.reduce((acc: any, badgeByClass: any) => {
      const classroom = badgeByClass.classroomName || t("badges.noClass");
      if (!acc[classroom]) acc[classroom] = [];
      acc[classroom].push(badgeByClass);
      return acc;
    }, {} as Record<string, any[]>);
  }, [filteredBadges, currentPage, pageSize]);

  const sortedClassrooms = useMemo(() => {
    const noClassLabel = t("badges.noClass");
    return Object.keys(groupedBadges).sort((a, b) => {
      if (a === noClassLabel) return 1;
      if (b === noClassLabel) return -1;
      return a.localeCompare(b);
    });
  }, [groupedBadges]);

  if (isBadgesLoading) {
    return <div className="flex items-center justify-center py-12">{t("common.loading")}</div>;
  }
  if (isCardsError) {
    return (
      <div className="py-12 text-center text-destructive" role="alert">{t("badges.loadError")}</div>
    );
  }

  return (
    <div className="space-y-6">
      <BadgeHeader
        studentsLabel={studentsLabel}
        studentLabel={studentLabel}
        onRefresh={refreshCards}
        onShowScanner={() => setShowScanner(true)}
        onOpenCreateDialog={() => setIsCreateDialogOpen(true)}
      />

      <BadgeStats
        totalBadges={badges.length}
        activeBadges={badges.length}
        inactiveBadges={0}
        withoutBadge={studentsWithoutBadge.length}
      />

      <Tabs defaultValue="badges" className="space-y-4">
        <TabsList>
          <TabsTrigger value="badges">
            <QrCode className="h-4 w-4 mr-2" />
            {t("badges.tabBadges")}
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-2" />
            {t("badges.tabHistory")}
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
                <div className="text-center py-8 text-muted-foreground">{t("badges.noBadgesFound")}</div>
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
