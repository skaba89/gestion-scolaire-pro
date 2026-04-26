import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  RefreshCw,
  CheckCircle,
  Clock,
  AlertCircle,
  GraduationCap,
  Calendar,
  FileText,
  Loader2,
  ArrowRight,
  User
} from "lucide-react";
import { toast } from "sonner";
import { useStudentLabel } from "@/hooks/useStudentLabel";

interface StudentWithEnrollments {
  id: string;
  first_name: string;
  last_name: string;
  registration_number: string | null;
  date_of_birth: string | null;
  gender: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  enrollments: Array<{
    id: string;
    status: string;
    level_id: string | null;
    academic_years: { id: string; name: string; is_current: boolean } | null;
    levels: { id: string; name: string } | null;
  }>;
}

const ParentPreRegistration = () => {
  const { t } = useTranslation();
  const { user, tenant, profile } = useAuth();
  const queryClient = useQueryClient();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [selectedChild, setSelectedChild] = useState<StudentWithEnrollments | null>(null);
  const [selectedLevelId, setSelectedLevelId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const { studentLabel, StudentLabel, studentsLabel, StudentsLabel } = useStudentLabel();

  const { data: children, isLoading: childrenLoading } = useQuery({
    queryKey: ["parent-children-preregistration", user?.id, tenant?.id],
    queryFn: async () => {
      if (!user?.id || !tenant?.id) return [];
      const { data } = await apiClient.get('/parents/children/', {
        params: { parent_id: user.id, tenant_id: tenant.id, with_enrollments: true },
      });
      return (Array.isArray(data) ? data.map((d: any) => d.students).filter(Boolean) : []) as StudentWithEnrollments[];
    },
    enabled: !!user?.id && !!tenant?.id,
  });

  const { data: nextAcademicYear } = useQuery({
    queryKey: ["next-academic-year", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      const { data } = await apiClient.get('/admissions/public/academic-years/', {
        params: { tenant_id: tenant.id },
      });
      const years = Array.isArray(data) ? data : [];
      if (years.length === 0) return null;
      const currentYear = years.find((y: any) => y.is_current);
      if (!currentYear) return years[years.length - 1];
      const currentIndex = years.findIndex((y: any) => y.id === currentYear.id);
      return years[currentIndex + 1] || null;
    },
    enabled: !!tenant?.id,
  });

  const { data: levels } = useQuery({
    queryKey: ["levels", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data } = await apiClient.get('/admissions/public/levels/', {
        params: { tenant_id: tenant.id },
      });
      return Array.isArray(data) ? data : [];
    },
    enabled: !!tenant?.id,
  });

  const { data: existingApplications } = useQuery({
    queryKey: ["pre-registrations", children?.map(c => c.id), nextAcademicYear?.id],
    queryFn: async () => {
      if (!children || children.length === 0 || !nextAcademicYear?.id || !tenant?.id) return {};
      const applications: Record<string, any> = {};
      for (const child of children) {
        const { data } = await apiClient.get('/admissions/public/apply/', {
          params: {
            tenant_id: tenant.id,
            academic_year_id: nextAcademicYear.id,
            student_first_name: child.first_name,
            student_last_name: child.last_name,
          },
        });
        const results = Array.isArray(data) ? data : (data ? [data] : []);
        if (results.length > 0) {
          applications[child.id] = results[0];
        }
      }
      return applications;
    },
    enabled: !!children && children.length > 0 && !!nextAcademicYear?.id && !!tenant?.id,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedChild || !tenant?.id || !nextAcademicYear?.id || !profile) {
        throw new Error("Données manquantes");
      }
      await apiClient.post('/admissions/public/apply/', {
        tenant_id: tenant.id,
        academic_year_id: nextAcademicYear.id,
        level_id: selectedLevelId || null,
        student_first_name: selectedChild.first_name,
        student_last_name: selectedChild.last_name,
        student_date_of_birth: selectedChild.date_of_birth,
        student_gender: selectedChild.gender,
        student_address: selectedChild.address,
        parent_first_name: profile.first_name || "Parent",
        parent_last_name: profile.last_name || "",
        parent_email: profile.email,
        parent_phone: profile.phone || "N/A",
        notes: `[PRÉ-RÉINSCRIPTION PARENT] ${notes}`.trim(),
        status: "SUBMITTED",
        submitted_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      toast.success(t("preRegistration.success"));
      setShowConfirmDialog(false);
      setNotes("");
      setSelectedChild(null);
      setSelectedLevelId("");
      queryClient.invalidateQueries({ queryKey: ["pre-registrations"] });
    },
    onError: (error) => {
      toast.error(t("preRegistration.error"));
    },
  });

  const getNextLevel = (child: StudentWithEnrollments) => {
    const currentEnrollment = child.enrollments?.find((e) => e.academic_years?.is_current);
    if (!currentEnrollment?.level_id || !levels) return null;
    const currentLevelIndex = levels.findIndex((l: any) => l.id === currentEnrollment.level_id);
    if (currentLevelIndex === -1 || currentLevelIndex >= levels.length - 1) return null;
    return levels[currentLevelIndex + 1];
  };

  const handlePreRegister = (child: StudentWithEnrollments) => {
    setSelectedChild(child);
    const nextLevel = getNextLevel(child);
    setSelectedLevelId(nextLevel?.id || "");
    setShowConfirmDialog(true);
  };

  const statusConfig = {
    DRAFT: { label: t("preRegistration.statusDraft"), color: "bg-muted text-muted-foreground" },
    SUBMITTED: { label: t("preRegistration.statusSubmitted"), color: "bg-blue-100 text-blue-700" },
    UNDER_REVIEW: { label: t("preRegistration.statusReview"), color: "bg-yellow-100 text-yellow-700" },
    ACCEPTED: { label: t("preRegistration.statusAccepted"), color: "bg-green-100 text-green-700" },
    REJECTED: { label: t("preRegistration.statusRejected"), color: "bg-red-100 text-red-700" },
    WAITLISTED: { label: t("preRegistration.statusWaitlist"), color: "bg-orange-100 text-orange-700" },
  };

  if (childrenLoading) {
    return (<div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>);
  }

  if (!children || children.length === 0) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-display font-bold text-foreground">{t("preRegistration.pageTitle")}</h1><p className="text-muted-foreground">Inscrivez vos {studentsLabel} pour l'année suivante</p></div>
        <Card><CardContent className="p-8 text-center"><AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" /><h2 className="text-lg font-semibold mb-2">Aucun {studentLabel} associé</h2><p className="text-muted-foreground">Votre compte n'est pas encore associé à des {studentsLabel}. Veuillez contacter l'administration.</p></CardContent></Card>
      </div>
    );
  }

  if (!nextAcademicYear) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-display font-bold text-foreground">{t("preRegistration.pageTitle")}</h1><p className="text-muted-foreground">Inscrivez vos {studentsLabel} pour l'année suivante</p></div>
        <Card><CardContent className="p-8 text-center"><Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" /><h2 className="text-lg font-semibold mb-2">{t("preRegistration.enrollmentsNotOpen")}</h2><p className="text-muted-foreground">{t("preRegistration.notOpenYet")}</p></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-display font-bold text-foreground">{t("preRegistration.pageTitle")}</h1><p className="text-muted-foreground">Inscrivez vos {studentsLabel} pour l'année {nextAcademicYear.name}</p></div>
      <Card className="bg-blue-500/5 border-blue-500/20"><CardContent className="p-4"><div className="flex items-start gap-3"><RefreshCw className="w-5 h-5 text-blue-600 mt-0.5" /><div><p className="font-medium text-foreground">{t("preRegistration.onlineTitle")}</p><p className="text-sm text-muted-foreground">{t("preRegistration.onlineDesc", { studentsLabel })}</p></div></div></CardContent></Card>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {children.map((child) => {
          const existingApp = existingApplications?.[child.id];
          const currentEnrollment = child.enrollments?.find((e) => e.academic_years?.is_current);
          const nextLevel = getNextLevel(child);
          return (
            <Card key={child.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2"><User className="w-4 h-4" />{child.first_name} {child.last_name}</CardTitle>
                  {existingApp && <Badge className={statusConfig[existingApp.status as keyof typeof statusConfig]?.color || "bg-muted"}>{statusConfig[existingApp.status as keyof typeof statusConfig]?.label || existingApp.status}</Badge>}
                </div>
                <CardDescription>{child.registration_number && `${t("preRegistration.studentNumber")} ${child.registration_number}`}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-sm"><div><span className="text-muted-foreground">{t("preRegistration.currentLevel")}</span><p className="font-medium">{currentEnrollment?.levels?.name || t("preRegistration.notEnrolled")}</p></div><div><span className="text-muted-foreground">{t("preRegistration.suggestedLevel")}</span><p className="font-medium">{nextLevel?.name || t("preRegistration.tbd")}</p></div></div>
                {existingApp ? (
                  <div className="bg-muted/50 rounded-lg p-3"><div className="flex items-center gap-2 text-sm">{existingApp.status === "ACCEPTED" ? <CheckCircle className="w-4 h-4 text-green-600" /> : existingApp.status === "REJECTED" ? <AlertCircle className="w-4 h-4 text-red-600" /> : <Clock className="w-4 h-4 text-blue-600" />}<span>{t("preRegistration.submittedOn")} {new Date(existingApp.submitted_at || existingApp.created_at).toLocaleDateString('fr-FR')}</span></div></div>
                ) : (
                  <Button onClick={() => handlePreRegister(child)} className="w-full"><RefreshCw className="w-4 w-4 mr-2" />{t("preRegistration.enrollForYear", { year: nextAcademicYear.name })}</Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Pré-Réinscription</DialogTitle><DialogDescription>Confirmez la pré-réinscription de {selectedChild?.first_name} {selectedChild?.last_name} pour l'année {nextAcademicYear?.name}.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label htmlFor="level">{t("preRegistration.desiredLevelLabel")}</Label><Select value={selectedLevelId} onValueChange={setSelectedLevelId}><SelectTrigger><SelectValue placeholder={t("preRegistration.selectLevel")} /></SelectTrigger><SelectContent>{levels?.map((level) => (<SelectItem key={level.id} value={level.id}>{level.name}{selectedChild && level.id === getNextLevel(selectedChild)?.id && ` (${t("preRegistration.suggested")})`}</SelectItem>))}</SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="notes">{t("preRegistration.notesOptional")}</Label><Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("preRegistration.additionalInfo")} rows={3} maxLength={500} /><p className="text-xs text-muted-foreground text-right">{notes.length}/500</p></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>{submitMutation.isPending ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("preRegistration.submitting")}</>) : (<>{t("preRegistration.confirm")}<ArrowRight className="w-4 h-4 ml-2" /></>)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ParentPreRegistration;
