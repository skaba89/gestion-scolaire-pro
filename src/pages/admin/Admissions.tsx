import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { BookOpen } from "lucide-react";
import { admissionQueries, useUpdateAdmissionStatus, useConvertAdmission, AdmissionStatus, AdmissionApplication } from "@/queries/admissions";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { AdmissionStats } from "@/components/admin/admissions/AdmissionStats";
import { AdmissionFilters } from "@/components/admin/admissions/AdmissionFilters";
import { AdmissionTable } from "@/components/admin/admissions/AdmissionTable";
import { AdmissionHeader } from "@/components/admin/admissions/AdmissionHeader";
import { ConvertAdmissionDialog } from "@/components/admin/admissions/ConvertAdmissionDialog";
import { useEducationModules } from "@/hooks/useEducationModules";

const Admissions = () => {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const { StudentLabel } = useStudentLabel();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: applications, isLoading, error } = useQuery(admissionQueries.all(tenant?.id || ""));
  const updateStatusMutation = useUpdateAdmissionStatus(tenant?.id || "");
  const convertMutation = useConvertAdmission(tenant?.id || "");
  // Lot Admissions (Q-A1) : « Inscrire » ouvre le choix de la classe ; obligatoire pour un compte
  // limité à des cycles (présentation seulement, le serveur décide).
  const { cycleScope } = useEducationModules();
  const [toConvert, setToConvert] = useState<AdmissionApplication | null>(null);

  const filteredApplications = useMemo(() => {
    // Extensive safety check for 'applications'
    let apps: any[] = [];
    if (Array.isArray(applications)) {
      apps = applications;
    } else if (applications && typeof applications === 'object' && Array.isArray((applications as any).items)) {
      apps = (applications as any).items;
    } else {
      apps = [];
    }

    return apps.filter((app: AdmissionApplication) => {
      if (!app) return false;
      const firstName = app.student_first_name || "";
      const lastName = app.student_last_name || "";
      const email = app.parent_email || "";

      const matchesSearch =
        firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        email.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === "all" || app.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [applications, searchTerm, statusFilter]);

  const stats = useMemo(() => {
    let apps: any[] = [];
    if (Array.isArray(applications)) {
      apps = applications;
    } else if (applications && typeof applications === 'object' && Array.isArray((applications as any).items)) {
      apps = (applications as any).items;
    }

    return {
      total: apps.length || 0,
      submitted: apps.filter((a: AdmissionApplication) => a.status === "SUBMITTED").length || 0,
      underReview: apps.filter((a: AdmissionApplication) => a.status === "UNDER_REVIEW").length || 0,
      accepted: apps.filter((a: AdmissionApplication) => a.status === "ACCEPTED").length || 0,
    };
  }, [applications]);

  const handleUpdateStatus = (id: string, status: AdmissionStatus, application: AdmissionApplication) => {
    updateStatusMutation.mutate({
      id,
      status,
      application,
      tenantName: tenant?.name
    });
  };

  const handleConvert = (_id: string, application: AdmissionApplication) => {
    setToConvert(application);
  };

  const confirmConvert = (classId: string | undefined) => {
    if (!toConvert) return;
    convertMutation.mutate({ id: toConvert.id, classId }, { onSuccess: () => setToConvert(null) });
  };

  return (
    <div className="space-y-6 min-h-0">
      <AdmissionHeader />

      {/* Stats Cards */}
      <AdmissionStats stats={stats} isLoading={isLoading} />

      {/* Filters */}
      <AdmissionFilters
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
      />

      {/* Applications Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            {t("admissions.applicationsTitle")} ({filteredApplications.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AdmissionTable
            applications={filteredApplications}
            isLoading={isLoading}
            studentLabel={StudentLabel}
            onUpdateStatus={handleUpdateStatus}
            onConvert={handleConvert}
            isConverting={convertMutation.isPending}
          />
        </CardContent>
      </Card>

      <ConvertAdmissionDialog
        tenantId={tenant?.id || ""}
        application={toConvert}
        classRequired={!!cycleScope?.restricted}
        isPending={convertMutation.isPending}
        onOpenChange={(open) => { if (!open) setToConvert(null); }}
        onConfirm={confirmConvert}
      />
    </div>
  );
};

export default Admissions;

