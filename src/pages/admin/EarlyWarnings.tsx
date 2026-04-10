import { useState } from "react";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
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
  const { user } = useAuth();
  const { tenant } = useTenant();
  const { studentsLabel } = useStudentLabel();
  const queryClient = useQueryClient();
  const [selectedAlert, setSelectedAlert] = useState<any>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");

  const { data: alerts, isLoading } = useQuery({
    queryKey: ["early-warnings", tenant?.id],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get("/school-life/early-warnings/");
        return data || [];
      } catch { return []; }
    },
    enabled: !!tenant?.id,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      await apiClient.put(`/school-life/early-warnings/${id}/`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["early-warnings"] });
      setSelectedAlert(null);
      setResolutionNotes("");
      toast.success("Alerte mise à jour");
    },
  });

  const acknowledgeAlert = (id: string) => {
    updateMutation.mutate({
      id,
      updates: {
        status: "acknowledged",
        acknowledged_by: user?.id,
        acknowledged_at: new Date().toISOString(),
      },
    });
  };

  const resolveAlert = (id: string) => {
    updateMutation.mutate({
      id,
      updates: {
        status: "resolved",
        resolved_by: user?.id,
        resolved_at: new Date().toISOString(),
        resolution_notes: resolutionNotes,
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
      academic: { icon: BookOpen, label: "Académique", className: "bg-blue-100 text-blue-800" },
      attendance: { icon: Calendar, label: "Assiduité", className: "bg-orange-100 text-orange-800" },
      behavior: { icon: AlertTriangle, label: "Comportement", className: "bg-red-100 text-red-800" },
      engagement: { icon: Activity, label: "Engagement", className: "bg-purple-100 text-purple-800" },
      wellbeing: { icon: Heart, label: "Bien-être", className: "bg-pink-100 text-pink-800" },
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
      low: { variant: "outline", label: "Faible" },
      medium: { variant: "secondary", label: "Moyen" },
      high: { variant: "default", label: "Élevé" },
      critical: { variant: "destructive", label: "Critique" },
    };
    const config = configs[severity] || configs.medium;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const newAlerts = alerts?.filter(a => a.status === "new") || [];
  const acknowledgedAlerts = alerts?.filter(a => a.status === "acknowledged" || a.status === "in_progress") || [];
  const resolvedAlerts = alerts?.filter(a => ["resolved", "dismissed"].includes(a.status)) || [];

  const criticalCount = newAlerts.filter(a => a.severity === "critical").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="h-8 w-8 text-primary" />
            Détection Précoce
          </h1>
          <p className="text-muted-foreground">
            Alertes automatiques pour le suivi des {studentsLabel} en difficulté
          </p>
        </div>
        {criticalCount > 0 && (
          <Badge variant="destructive" className="text-lg px-4 py-2">
            {criticalCount} alerte(s) critique(s)
          </Badge>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-red-500/50">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{newAlerts.length}</div>
            <p className="text-sm text-muted-foreground">Nouvelles alertes</p>
          </CardContent>
        </Card>
        <Card className="border-orange-500/50">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-orange-600">{acknowledgedAlerts.length}</div>
            <p className="text-sm text-muted-foreground">En traitement</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{resolvedAlerts.length}</div>
            <p className="text-sm text-muted-foreground">Résolues</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {alerts?.filter(a => a.alert_type === "academic").length || 0}
            </div>
            <p className="text-sm text-muted-foreground">Alertes académiques</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="new" className="space-y-4">
        <TabsList>
          <TabsTrigger value="new" className="relative">
            Nouvelles ({newAlerts.length})
            {criticalCount > 0 && (
              <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full animate-pulse" />
            )}
          </TabsTrigger>
          <TabsTrigger value="processing">En traitement ({acknowledgedAlerts.length})</TabsTrigger>
          <TabsTrigger value="resolved">Résolues ({resolvedAlerts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="space-y-4">
          {newAlerts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <p>Aucune nouvelle alerte</p>
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
                        <p className="text-xs font-medium text-muted-foreground">Actions recommandées:</p>
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
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Prendre en charge
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => dismissAlert(alert.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="processing" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {acknowledgedAlerts.map((alert: any) => (
              <Card key={alert.id} className="border-orange-500/30">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    {getTypeBadge(alert.alert_type)}
                    <Badge variant="outline">En cours</Badge>
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
                      Pris en charge par {alert.acknowledged_user.first_name} {alert.acknowledged_user.last_name}
                    </div>
                  )}
                </CardContent>
                <CardFooter>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => setSelectedAlert(alert)}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Marquer comme résolu
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="resolved" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {resolvedAlerts.slice(0, 12).map((alert: any) => (
              <Card key={alert.id} className="opacity-75">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    {getTypeBadge(alert.alert_type)}
                    <Badge variant={alert.status === "resolved" ? "secondary" : "outline"}>
                      {alert.status === "resolved" ? "Résolu" : "Ignoré"}
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
        </TabsContent>
      </Tabs>

      {/* Resolution Dialog */}
      <Dialog open={!!selectedAlert} onOpenChange={() => setSelectedAlert(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Résoudre l'alerte</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="font-medium">{selectedAlert?.title}</p>
              <p className="text-sm text-muted-foreground">
                {selectedAlert?.student?.first_name} {selectedAlert?.student?.last_name}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Notes de résolution</Label>
              <Textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Décrivez les actions entreprises..."
                rows={4}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => selectedAlert && resolveAlert(selectedAlert.id)}
                className="flex-1"
              >
                Confirmer la résolution
              </Button>
              <Button variant="outline" onClick={() => setSelectedAlert(null)}>
                Annuler
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
