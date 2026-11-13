import { useAlumniDashboard } from "@/queries/alumni";
import { useTenantUrl } from "@/hooks/useTenantUrl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formatDate } from "@/lib/locale";
import {
  FileText,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  ArrowRight,
  GraduationCap,
  Users,
} from "lucide-react";

export default function AlumniDashboard() {
  const { t } = useTranslation();
  const { getTenantUrl } = useTenantUrl();

  // Fetch dashboard data from sovereign API
  const { data: dashboardData, isLoading: loadingDashboard } = useAlumniDashboard();

  const requestsStats = dashboardData?.requests_stats;
  const unreadCount = dashboardData?.unread_count;
  const recentRequests = dashboardData?.recent_requests;

  const loadingRequests = loadingDashboard;


  const getStatusInfo = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: t("alumniPortal.status.pending"), variant: "outline" },
      in_progress: { label: t("alumniPortal.status.in_progress"), variant: "secondary" },
      awaiting_validation: { label: t("alumniPortal.status.awaiting_validation"), variant: "secondary" },
      completed: { label: t("alumniPortal.status.completed"), variant: "default" },
      rejected: { label: t("alumniPortal.status.rejected"), variant: "destructive" },
      cancelled: { label: t("alumniPortal.status.cancelled"), variant: "outline" },
    };
    return statusMap[status] || { label: status, variant: "outline" };
  };

  const documentTypeLabels: Record<string, string> = {
    transcript: t("alumniPortal.docType.transcript"),
    diploma: t("alumniPortal.docType.diploma"),
    certificate: t("alumniPortal.docType.certificate"),
    attestation: t("alumniPortal.docType.attestation"),
    other: t("alumniPortal.docType.other"),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">
          {t("alumniPortal.dashboard.title")}
        </h1>
        <p className="text-muted-foreground">
          {t("alumniPortal.dashboard.welcome")}
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link to={getTenantUrl("/alumni/document-requests")}>
          <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-primary/10">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("alumniPortal.dashboard.requests")}</p>
                  {loadingRequests ? (
                    <Skeleton className="h-7 w-12" />
                  ) : (
                    <p className="text-2xl font-bold">{requestsStats?.total || 0}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to={getTenantUrl("/alumni/messages")}>
          <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-blue-500/10">
                  <MessageSquare className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("alumniPortal.dashboard.messages")}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold">{unreadCount || 0}</p>
                    {unreadCount && unreadCount > 0 && (
                      <Badge variant="destructive" className="text-xs">{t("alumniPortal.dashboard.new")}</Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Card className="h-full">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-yellow-500/10">
                <Clock className="h-6 w-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("alumniPortal.dashboard.inProgress")}</p>
                {loadingRequests ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  <p className="text-2xl font-bold">{requestsStats?.in_progress || 0}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-green-500/10">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("alumniPortal.dashboard.completed")}</p>
                {loadingRequests ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  <p className="text-2xl font-bold">{requestsStats?.completed || 0}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Requests */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">{t("alumniPortal.dashboard.recentRequests")}</CardTitle>
              <CardDescription>{t("alumniPortal.dashboard.recentRequestsHint")}</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to={getTenantUrl("/alumni/document-requests")}>
                <Plus className="h-4 w-4 mr-2" />
                {t("alumniPortal.dashboard.newRequest")}
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentRequests?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">{t("alumniPortal.dashboard.noRequest")}</p>
                <Button variant="link" size="sm" asChild className="mt-2">
                  <Link to={getTenantUrl("/alumni/document-requests")}>
                    {t("alumniPortal.dashboard.makeRequest")}
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {recentRequests?.map((request) => {
                  const statusInfo = getStatusInfo(request.status);
                  return (
                    <div
                      key={request.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-sm">
                            {documentTypeLabels[request.document_type] || request.document_type}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(request.created_at)}
                          </p>
                        </div>
                      </div>
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                    </div>
                  );
                })}
                <Button variant="ghost" size="sm" asChild className="w-full mt-2">
                  <Link to={getTenantUrl("/alumni/document-requests")}>
                    {t("alumniPortal.dashboard.allRequests")}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Links */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("alumniPortal.dashboard.quickAccess")}</CardTitle>
            <CardDescription>{t("alumniPortal.dashboard.mainFeatures")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link to={getTenantUrl("/alumni/document-requests")}>
              <div className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{t("alumniPortal.dashboard.documentRequest")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("alumniPortal.dashboard.documentRequestHint")}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>

            <Link to={getTenantUrl("/alumni/messages")}>
              <div className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <MessageSquare className="h-5 w-5 text-blue-500" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{t("alumniPortal.dashboard.messaging")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("alumniPortal.dashboard.messagingHint")}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>

            <Link to={getTenantUrl("/alumni/careers")}>
              <div className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <GraduationCap className="h-5 w-5 text-green-500" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{t("alumniPortal.dashboard.careers")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("alumniPortal.dashboard.careersHint")}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
