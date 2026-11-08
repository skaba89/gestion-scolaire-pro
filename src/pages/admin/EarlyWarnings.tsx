import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchEarlyWarningSummary, fetchEarlyWarningActivePage, fetchEarlyWarningHistory, updateEarlyWarning, normalizeEarlyWarningResolutionNotes } from "@/utils/earlyWarningsApi";
import { CreateEarlyWarningDialog } from "@/components/admin/early-warnings/CreateEarlyWarningDialog";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlertTriangle,
  TrendingDown,
  Calendar,
  User,
  CheckCircle2,
  Eye,
  Brain,
  BookOpen,
  Clock,
  Activity,
  Heart,
  X
} from "lucide-react";

export default function EarlyWarnings() {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const { studentsLabel } = useStudentLabel();
  const queryClient = useQueryClient();
  const [selectedAlert, setSelectedAlert] = useState<any>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [newPage, setNewPage] = useState(1);
  const [processingPage, setProcessingPage] = useState(1);
  useEffect(() => { setNewPage(1); setProcessingPage(1); setHistoryPage(1); }, [tenant?.id]);

  const { data: summary, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["early-warnings", tenant?.id, "summary"],
    queryFn: fetchEarlyWarningSummary, enabled: !!tenant?.id, retry: false,
  });
  const newQuery = useQuery({
    queryKey: ["early-warnings", tenant?.id, "new", newPage],
    queryFn: () => fetchEarlyWarningActivePage("new", newPage),
    enabled: !!tenant?.id && !!summary && !isError, retry: false,
  });
  const processingQuery = useQuery({
    queryKey: ["early-warnings", tenant?.id, "processing", processingPage],
    queryFn: () => fetchEarlyWarningActivePage("processing", processingPage),
    enabled: !!tenant?.id && !!summary && !isError, retry: false,
  });
  const historyQuery = useQuery({
    queryKey: ["early-warnings", tenant?.id, "closed-history", historyPage],
    queryFn: () => fetchEarlyWarningHistory(historyPage),
    enabled: !!tenant?.id && !!summary && !isError, retry: false,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      await updateEarlyWarning(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["early-warnings"] });
      setSelectedAlert(null);
      setResolutionNotes("");
      toast.success(t("earlyWarnings.alertUpdated"));
    },
    onError: () => {
      toast.error("Impossible de mettre à jour l'alerte. Aucune modification confirmée.");
    },
  });

  const acknowledgeAlert = (id: string) => {
    updateMutation.mutate({
      id,
      updates: {
        status: "acknowledged",
      },
    });
  };

  const resolveAlert = (id: string) => {
    const notes = normalizeEarlyWarningResolutionNotes(resolutionNotes);
    if (!notes) {
      toast.error("Indiquez une justification de résolution (4 000 caractères maximum).");
      return;
    }
    updateMutation.mutate({
      id,
      updates: {
        status: "resolved",
        resolution_notes: notes,
      },
    });
  };

  const dismissAlert = (id: string) => {
    updateMutation.mutate({
      id,
      updates: { status: "dismissed" },
    });
  };

  const getTypeBadge = (type: string) => {
    const configs: Record<string, { icon: any; label: string; className: string }> = {
      academic: { icon: BookOpen, label: t("earlyWarnings.typeAcademic"), className: "bg-blue-100 text-blue-800" },
      attendance: { icon: Calendar, label: t("earlyWarnings.typeAttendance"), className: "bg-orange-100 text-orange-800" },
      behavior: { icon: AlertTriangle, label: t("earlyWarnings.typeBehavior"), className: "bg-red-100 text-red-800" },
      engagement: { icon: Activity, label: t("earlyWarnings.typeEngagement"), className: "bg-purple-100 text-purple-800" },
      wellbeing: { icon: Heart, label: t("earlyWarnings.typeWellbeing"), className: "bg-pink-100 text-pink-800" },
    };
    const config = configs[type] || configs.academic;
    const Icon = config.icon;
    return (
      <Badge className={config.className}>
        <Icon className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  const getSeverityBadge = (severity: string) => {
    const configs: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      low: { variant: "outline", label: t("earlyWarnings.severityLow") },
      medium: { variant: "secondary", label: t("earlyWarnings.severityMedium") },
      high: { variant: "default", label: t("earlyWarnings.severityHigh") },
      critical: { variant: "destructive", label: t("earlyWarnings.severityCritical") },
    };
    const config = configs[severity] || configs.medium;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const newAlerts = newQuery.data?.items ?? [];
  const acknowledgedAlerts = processingQuery.data?.items ?? [];
  const criticalCount = summary?.critical_new ?? 0;
  const history = historyQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="h-8 w-8 text-primary" />
            {t("earlyWarnings.pageTitle")}
          </h1>
          <p className="text-muted-foreground">
            {t("earlyWarnings.pageSubtitle", { label: studentsLabel })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isError && !isLoading && criticalCount > 0 && (
            <Badge variant="destructive" className="text-lg px-4 py-2">
              {t("earlyWarnings.criticalCount", { count: criticalCount })}
            </Badge>
          )}
          <Button onClick={() => setCreateOpen(true)} disabled={!tenant?.id}>
            Créer une alerte
          </Button>
        </div>
      </div>

      {isError && (
        <Card role="alert" className="border-destructive/50">
          <CardHeader>
            <CardTitle>Alertes indisponibles</CardTitle>
            <CardDescription>
              Impossible de charger les alertes de cet établissement. Les compteurs
              ne sont pas fiables tant que la connexion au service n'est pas rétablie.
              {((error as any)?.response?.status === 404) &&
                " Le service des alertes n'est pas disponible sur cette API."}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="outline" onClick={() => refetch()}>
              Réessayer
            </Button>
          </CardFooter>
        </Card>
      )}

      {!tenant?.id && (
        <p role="status" className="text-sm text-muted-foreground">Sélectionnez un établissement pour consulter ses alertes.</p>
      )}

      {!!tenant?.id && !isError && !isLoading && !summary && (
        <p role="status" className="text-sm text-muted-foreground">Chargement des alertes…</p>
      )}

      {!!tenant?.id && !!summary && !isError && !isLoading && (
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-red-500/50">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{summary.new}</div>
            <p className="text-sm text-muted-foreground">{t("earlyWarnings.statNew")}</p>
          </CardContent>
        </Card>
        <Card className="border-orange-500/50">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-orange-600">{summary.processing}</div>
            <p className="text-sm text-muted-foreground">{t("earlyWarnings.statProcessing")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{summary.closed}</div>
            <p className="text-sm text-muted-foreground">{t("earlyWarnings.statResolved")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {summary.academic}
            </div>
            <p className="text-sm text-muted-foreground">{t("earlyWarnings.statAcademic")}</p>
          </CardContent>
        </Card>
      </div>

      )}

      {!!tenant?.id && !!summary && !isError && !isLoading && (
      <Tabs defaultValue="new" className="space-y-4">
        <TabsList>
          <TabsTrigger value="new" className="relative">
            {t("earlyWarnings.tabNew", { count: newAlerts.length })}
            {criticalCount > 0 && (
              <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full animate-pulse" />
            )}
          </TabsTrigger>
          <TabsTrigger value="processing">{t("earlyWarnings.tabProcessing", { count: acknowledgedAlerts.length })}</TabsTrigger>
          <TabsTrigger value="resolved">{t("earlyWarnings.tabResolved", { count: summary.closed })}</TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="space-y-4">
          {newQuery.isLoading && <p role="status">Chargement des nouvelles alertes…</p>}
          {newQuery.isError && <div role="alert">Impossible de charger les nouvelles alertes. <Button variant="outline" onClick={() => newQuery.refetch()}>Réessayer</Button></div>}
          {!newQuery.isError && !newQuery.isLoading && newQuery.data && (newAlerts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <p>{t("earlyWarnings.noNewAlerts")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {newAlerts.map((alert: any) => (
                <Card
                  key={alert.id}
                  className={`hover:shadow-md transition-shadow ${alert.severity === "critical" ? "border-red-500 bg-red-500/5" : ""
                    }`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      {getTypeBadge(alert.alert_type)}
                      {getSeverityBadge(alert.severity)}
                    </div>
                    <CardTitle className="text-lg mt-2">{alert.title}</CardTitle>
                    <CardDescription className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {alert.student?.first_name} {alert.student?.last_name}
                      {alert.student?.registration_number && (
                        <span className="text-xs opacity-75">({alert.student.registration_number})</span>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground line-clamp-2">{alert.description}</p>

                    {alert.recommended_actions && alert.recommended_actions.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">{t("earlyWarnings.recommendedActions")}</p>
                        <ul className="text-xs space-y-1">
                          {alert.recommended_actions.slice(0, 2).map((action: string, i: number) => (
                            <li key={i} className="flex items-start gap-1">
                              <span className="text-primary">•</span>
                              {action}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true, locale: fr })}
                    </div>
                  </CardContent>
                  <CardFooter className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => acknowledgeAlert(alert.id)}
                      disabled={updateMutation.isPending}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      {t("earlyWarnings.acknowledge")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => dismissAlert(alert.id)}
                      disabled={updateMutation.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ))}
          {newQuery.data && newQuery.data.total > 0 && newAlerts.length === 0 && (
            <Button variant="outline" onClick={() => setNewPage(1)}>Première page</Button>
          )}
          {newQuery.data && newQuery.data.total_pages > 1 && (
            <nav aria-label="Pagination des nouvelles alertes" className="flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" disabled={newPage <= 1} onClick={() => setNewPage(newPage - 1)}>Précédent</Button>
              <span aria-live="polite">Page {newPage} sur {newQuery.data.total_pages}</span>
              <Button variant="outline" size="sm" disabled={newPage >= newQuery.data.total_pages} onClick={() => setNewPage(newPage + 1)}>Suivant</Button>
            </nav>
          )}
        </TabsContent>

        <TabsContent value="processing" className="space-y-4">
          {processingQuery.isLoading && <p role="status">Chargement des alertes en cours…</p>}
          {processingQuery.isError && <div role="alert">Impossible de charger les alertes en cours. <Button variant="outline" onClick={() => processingQuery.refetch()}>Réessayer</Button></div>}
          {processingQuery.data?.total === 0 && <p role="status">Aucune alerte en cours.</p>}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {!processingQuery.isError && acknowledgedAlerts.map((alert: any) => (
              <Card key={alert.id} className="border-orange-500/30">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    {getTypeBadge(alert.alert_type)}
                    <Badge variant="outline">{t("earlyWarnings.inProgress")}</Badge>
                  </div>
                  <CardTitle className="text-lg mt-2">{alert.title}</CardTitle>
                  <CardDescription>
                    {alert.student?.first_name} {alert.student?.last_name}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{alert.description}</p>
                  {alert.acknowledged_user && (
                    <div className="text-xs text-muted-foreground">
                      {t("earlyWarnings.acknowledgedBy", { first: alert.acknowledged_user.first_name, last: alert.acknowledged_user.last_name })}
                    </div>
                  )}
                </CardContent>
                <CardFooter>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => setSelectedAlert(alert)}
                    disabled={updateMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    {t("earlyWarnings.markResolved")}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
          {processingQuery.data && processingQuery.data.total > 0 && acknowledgedAlerts.length === 0 && (
            <Button variant="outline" onClick={() => setProcessingPage(1)}>Première page</Button>
          )}
          {processingQuery.data && processingQuery.data.total_pages > 1 && (
            <nav aria-label="Pagination des alertes en cours" className="flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" disabled={processingPage <= 1} onClick={() => setProcessingPage(processingPage - 1)}>Précédent</Button>
              <span aria-live="polite">Page {processingPage} sur {processingQuery.data.total_pages}</span>
              <Button variant="outline" size="sm" disabled={processingPage >= processingQuery.data.total_pages} onClick={() => setProcessingPage(processingPage + 1)}>Suivant</Button>
            </nav>
          )}
        </TabsContent>

        <TabsContent value="resolved" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {!historyQuery.isError && history?.items.map((alert: any) => (
              <Card key={alert.id} className="opacity-75">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    {getTypeBadge(alert.alert_type)}
                    <Badge variant={alert.status === "resolved" ? "secondary" : "outline"}>
                      {alert.status === "resolved" ? t("earlyWarnings.statusResolved") : t("earlyWarnings.statusDismissed")}
                    </Badge>
                  </div>
                  <CardTitle className="text-base mt-2">{alert.title}</CardTitle>
                  <CardDescription>
                    {alert.student?.first_name} {alert.student?.last_name}
                  </CardDescription>
                </CardHeader>
                {alert.resolution_notes && (
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{alert.resolution_notes}</p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
          {historyQuery.isLoading && <p role="status">Chargement de l'historique…</p>}
          {historyQuery.isError && (
            <div role="alert" className="space-y-2">
              <p>Impossible de charger l'historique des alertes clôturées.</p>
              <Button variant="outline" onClick={() => historyQuery.refetch()}>Réessayer</Button>
            </div>
          )}
          {history && history.total === 0 && <p role="status">Aucune alerte clôturée.</p>}
          {history && history.total > 0 && history.items.length === 0 && (
            <Button variant="outline" onClick={() => setHistoryPage(1)}>Revenir à la première page</Button>
          )}
          {history && history.total_pages > 1 && (
            <nav aria-label="Pagination des alertes clôturées" className="flex items-center justify-center gap-3 pt-3">
              <Button variant="outline" size="sm" disabled={history.page <= 1}
                onClick={() => setHistoryPage(history.page - 1)}>Précédent</Button>
              <span className="text-sm text-muted-foreground" aria-live="polite">
                Page {history.page} sur {history.total_pages}
              </span>
              <Button variant="outline" size="sm" disabled={history.page >= history.total_pages}
                onClick={() => setHistoryPage(history.page + 1)}>Suivant</Button>
            </nav>
          )}
        </TabsContent>
      </Tabs>

      )}

      <CreateEarlyWarningDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        tenantId={tenant?.id ?? ""}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["early-warnings", tenant?.id] })}
      />

      {/* Resolution Dialog */}
      <Dialog open={!!selectedAlert} onOpenChange={(open) => { if (!open && !updateMutation.isPending) { setSelectedAlert(null); setResolutionNotes(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("earlyWarnings.resolveTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="font-medium">{selectedAlert?.title}</p>
              <p className="text-sm text-muted-foreground">
                {selectedAlert?.student?.first_name} {selectedAlert?.student?.last_name}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t("earlyWarnings.resolutionNotes")}</Label>
              <Textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder={t("earlyWarnings.resolutionPlaceholder")}
                rows={4}
                maxLength={4000}
                aria-required="true"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => selectedAlert && resolveAlert(selectedAlert.id)}
                className="flex-1"
                disabled={updateMutation.isPending || !normalizeEarlyWarningResolutionNotes(resolutionNotes)}
              >
                {t("earlyWarnings.confirmResolve")}
              </Button>
              <Button variant="outline" disabled={updateMutation.isPending} onClick={() => { setSelectedAlert(null); setResolutionNotes(""); }}>
                {t("earlyWarnings.cancel")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
