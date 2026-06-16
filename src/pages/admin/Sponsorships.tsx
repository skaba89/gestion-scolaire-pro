import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Users, UserCheck, UserPlus, Heart, Trash2, Edit } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";


type Student = {
  id: string;
  first_name: string;
  last_name: string;
  registration_number: string | null;
};

type AcademicYear = {
  id: string;
  name: string;
  is_current: boolean | null;
};

export default function Sponsorships() {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const statusConfig = useMemo<Record<string, { label: string; color: string }>>(() => ({
    PENDING: { label: t("sponsorships.statusPending"), color: "bg-yellow-500" },
    ACTIVE: { label: t("sponsorships.statusActive"), color: "bg-green-500" },
    COMPLETED: { label: t("sponsorships.statusCompleted"), color: "bg-blue-500" },
    CANCELLED: { label: t("sponsorships.statusCancelled"), color: "bg-red-500" },
  }), [t]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedSponsorship, setSelectedSponsorship] = useState<any>(null);
  const [formData, setFormData] = useState({
    sponsor_id: "",
    sponsored_id: "",
    academic_year_id: "",
    status: "active",
    notes: "",
  });

  // Fetch sponsorships
  const { data: sponsorships, isLoading } = useQuery({
    queryKey: ["student-sponsorships", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      try {
        const { data } = await apiClient.get("/school-life/sponsorships/");
        return data || [];
      } catch { return []; }
    },
    enabled: !!tenant?.id,
  });

  // Fetch students for selection
  const { data: students } = useQuery({
    queryKey: ["students-for-sponsorship", tenant?.id],
    queryFn: async (): Promise<Student[]> => {
      if (!tenant?.id) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try {
        const { data } = await apiClient.get("/students/", {
          params: { status: "ACTIVE" }
        });
        return (data?.items || data || []) as Student[];
      } catch { return []; }
    },
    enabled: !!tenant?.id,
  });

  // Fetch academic years
  const { data: academicYears } = useQuery({
    queryKey: ["academic-years-sponsorship", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      try {
        const { data } = await apiClient.get("/academic-years/");
        return (data || []) as AcademicYear[];
      } catch { return []; }
    },
    enabled: !!tenant?.id,
  });

  // Helper to get student info
  const getStudent = (studentId: string): Student | undefined => {
    return students?.find((s) => s.id === studentId);
  };

  // Helper to get academic year info
  const getAcademicYear = (yearId: string | null): AcademicYear | undefined => {
    if (!yearId) return undefined;
    return academicYears?.find((y) => y.id === yearId);
  };

  // Create/Update sponsorship
  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData & { id?: string }) => {
      if (data.id) {
        await apiClient.put(`/school-life/sponsorships/${data.id}/`, {
          sponsor_id: data.sponsor_id,
          sponsored_id: data.sponsored_id,
          academic_year_id: data.academic_year_id || null,
          status: data.status,
          notes: data.notes,
        });
      } else {
        await apiClient.post("/school-life/sponsorships/", {
          tenant_id: tenant?.id,
          sponsor_id: data.sponsor_id,
          sponsored_id: data.sponsored_id,
          academic_year_id: data.academic_year_id || null,
          status: data.status,
          notes: data.notes,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-sponsorships"] });
      toast.success(selectedSponsorship ? t("sponsorships.updated") : t("sponsorships.created"));
      resetForm();
    },
    onError: () => {
      toast.error(t("sponsorships.saveError"));
    },
  });

  // Delete sponsorship
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/school-life/sponsorships/${id}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-sponsorships"] });
      toast.success(t("sponsorships.deleted"));
    },
    onError: () => {
      toast.error(t("sponsorships.deleteError"));
    },
  });

  const resetForm = () => {
    setFormData({
      sponsor_id: "",
      sponsored_id: "",
      academic_year_id: academicYears?.find((y) => y.is_current)?.id || "",
      status: "active",
      notes: "",
    });
    setSelectedSponsorship(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (sponsorship: any) => {
    setSelectedSponsorship(sponsorship);
    setFormData({
      sponsor_id: sponsorship.sponsor_id,
      sponsored_id: sponsorship.sponsored_id,
      academic_year_id: sponsorship.academic_year_id || "",
      status: sponsorship.status,
      notes: sponsorship.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.sponsor_id || !formData.sponsored_id) {
      toast.error(t("sponsorships.selectBothError"));
      return;
    }
    if (formData.sponsor_id === formData.sponsored_id) {
      toast.error(t("sponsorships.samePersonError"));
      return;
    }
    saveMutation.mutate({ ...formData, id: selectedSponsorship?.id });
  };

  // Stats
  const activeCount = sponsorships?.filter((s) => s.status === "ACTIVE").length || 0;
  const completedCount = sponsorships?.filter((s) => s.status === "COMPLETED").length || 0;
  const pendingCount = sponsorships?.filter((s) => s.status === "PENDING").length || 0;

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">{t("sponsorships.loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("sponsorships.pageTitle")}</h1>
          <p className="text-muted-foreground">
            {t("sponsorships.pageSubtitle")}
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="h-4 w-4 mr-2" />
              {t("sponsorships.newSponsorship")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selectedSponsorship ? t("sponsorships.editTitle") : t("sponsorships.createTitle")}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t("sponsorships.sponsor")}</Label>
                <Select
                  value={formData.sponsor_id}
                  onValueChange={(value) => setFormData({ ...formData, sponsor_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("sponsorships.selectSponsor")} />
                  </SelectTrigger>
                  <SelectContent>
                    {students
                      ?.filter((s) => s.id !== formData.sponsored_id)
                      .map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.first_name} {student.last_name} ({student.registration_number})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("sponsorships.sponsored")}</Label>
                <Select
                  value={formData.sponsored_id}
                  onValueChange={(value) => setFormData({ ...formData, sponsored_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("sponsorships.selectSponsored")} />
                  </SelectTrigger>
                  <SelectContent>
                    {students
                      ?.filter((s) => s.id !== formData.sponsor_id)
                      .map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.first_name} {student.last_name} ({student.registration_number})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("sponsorships.academicYear")}</Label>
                <Select
                  value={formData.academic_year_id}
                  onValueChange={(value) => setFormData({ ...formData, academic_year_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("sponsorships.selectYear")} />
                  </SelectTrigger>
                  <SelectContent>
                    {academicYears?.map((year) => (
                      <SelectItem key={year.id} value={year.id}>
                        {year.name} {year.is_current && `(${t("sponsorships.current")})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("sponsorships.status")}</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusConfig).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("sponsorships.notes")}</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder={t("sponsorships.notesPlaceholder")}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={resetForm}>
                  {t("sponsorships.cancel")}
                </Button>
                <Button onClick={handleSubmit} disabled={saveMutation.isPending}>
                  {selectedSponsorship ? t("sponsorships.update") : t("sponsorships.create")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              {t("sponsorships.activeCount")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              {t("sponsorships.pendingCount")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Heart className="h-4 w-4" />
              {t("sponsorships.completedCount")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{completedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              {t("sponsorships.total")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sponsorships?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Sponsorships Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("sponsorships.listTitle")}</CardTitle>
          <CardDescription>
            {t("sponsorships.listDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sponsorships && sponsorships.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("sponsorships.colSponsor")}</TableHead>
                  <TableHead>{t("sponsorships.colSponsored")}</TableHead>
                  <TableHead>{t("sponsorships.colYear")}</TableHead>
                  <TableHead>{t("sponsorships.colStatus")}</TableHead>
                  <TableHead>{t("sponsorships.colDate")}</TableHead>
                  <TableHead className="text-right">{t("sponsorships.colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sponsorships.map((sponsorship) => {
                  const sponsor = getStudent(sponsorship.sponsor_id);
                  const sponsored = getStudent(sponsorship.sponsored_id);
                  const academicYear = getAcademicYear(sponsorship.academic_year_id);
                  return (
                    <TableRow key={sponsorship.id}>
                      <TableCell>
                        <div className="font-medium">
                          {sponsor ? `${sponsor.first_name} ${sponsor.last_name}` : "-"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {sponsor?.registration_number || "-"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {sponsored ? `${sponsored.first_name} ${sponsored.last_name}` : "-"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {sponsored?.registration_number || "-"}
                        </div>
                      </TableCell>
                      <TableCell>{academicYear?.name || "-"}</TableCell>
                      <TableCell>
                        <Badge className={statusConfig[sponsorship.status]?.color || "bg-gray-500"}>
                          {statusConfig[sponsorship.status]?.label || sponsorship.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(sponsorship.created_at), "dd/MM/yyyy", { locale: fr })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(sponsorship)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm(t("sponsorships.confirmDelete"))) {
                                deleteMutation.mutate(sponsorship.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">{t("sponsorships.empty")}</h3>
              <p className="text-muted-foreground mb-4">
                {t("sponsorships.emptyDesc")}
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {t("sponsorships.createFirst")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
