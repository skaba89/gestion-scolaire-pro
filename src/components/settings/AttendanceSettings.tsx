import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Clock, Save, QrCode } from "lucide-react";

interface AttendanceConfig {
  enableQRBadges: boolean;
  enableManualAttendance: boolean;
  alertThreshold: number;
  lateThresholdMinutes: number;
  requireJustification: boolean;
  trackSessionAttendance: boolean;
}

const AttendanceSettings = () => {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<AttendanceConfig>({
    enableQRBadges: true,
    enableManualAttendance: true,
    alertThreshold: 80,
    lateThresholdMinutes: 15,
    requireJustification: true,
    trackSessionAttendance: true,
  });

  useEffect(() => {
    if (tenant?.settings) {
      const settings = tenant.settings as Record<string, any>;
      setConfig({
        enableQRBadges: settings.enableQRBadges ?? true,
        enableManualAttendance: settings.enableManualAttendance ?? true,
        alertThreshold: settings.alertThreshold ?? 80,
        lateThresholdMinutes: settings.lateThresholdMinutes ?? 15,
        requireJustification: settings.requireJustification ?? true,
        trackSessionAttendance: settings.trackSessionAttendance ?? true,
      });
    }
  }, [tenant]);

  const handleSave = async () => {
    if (!tenant) return;
    setLoading(true);

    try {
      const currentSettings = (tenant.settings as Record<string, any>) || {};
      const newSettings = { ...currentSettings, ...config };

      await apiClient.patch(`/tenants/${tenant.id}/`, {
        settings: newSettings,
      });

      toast({
        title: "Paramètres enregistrés",
        description: "Les paramètres de présence ont été mis à jour.",
      });
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Clock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>Paramètres de Présence</CardTitle>
            <CardDescription>Configurez le suivi des présences et absences</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* QR Badges */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
          <div className="flex items-center gap-3">
            <QrCode className="w-5 h-5 text-primary" />
            <div>
              <Label className="text-base font-medium">Badges QR Code</Label>
              <p className="text-sm text-muted-foreground">
                Activer le pointage par scan de badges QR
              </p>
            </div>
          </div>
          <Switch
            checked={config.enableQRBadges}
            onCheckedChange={(checked) => setConfig({ ...config, enableQRBadges: checked })}
          />
        </div>

        {/* Manual Attendance */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
          <div>
            <Label className="text-base font-medium">Pointage manuel</Label>
            <p className="text-sm text-muted-foreground">
              Permettre aux enseignants de marquer manuellement les présences
            </p>
          </div>
          <Switch
            checked={config.enableManualAttendance}
            onCheckedChange={(checked) => setConfig({ ...config, enableManualAttendance: checked })}
          />
        </div>

        {/* Session Attendance */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
          <div>
            <Label className="text-base font-medium">Présence par séance</Label>
            <p className="text-sm text-muted-foreground">
              Suivre la présence pour chaque séance de cours individuellement
            </p>
          </div>
          <Switch
            checked={config.trackSessionAttendance}
            onCheckedChange={(checked) => setConfig({ ...config, trackSessionAttendance: checked })}
          />
        </div>

        {/* Justification Required */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
          <div>
            <Label className="text-base font-medium">Justification obligatoire</Label>
            <p className="text-sm text-muted-foreground">
              Exiger une justification pour les absences
            </p>
          </div>
          <Switch
            checked={config.requireJustification}
            onCheckedChange={(checked) => setConfig({ ...config, requireJustification: checked })}
          />
        </div>

        {/* Thresholds */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="alertThreshold">Seuil d'alerte présence (%)</Label>
            <Input
              id="alertThreshold"
              type="number"
              min="0"
              max="100"
              value={config.alertThreshold}
              onChange={(e) => setConfig({ ...config, alertThreshold: parseInt(e.target.value) || 80 })}
            />
            <p className="text-xs text-muted-foreground">
              Alerte si le taux de présence tombe en dessous de ce seuil
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lateThreshold">Seuil de retard (minutes)</Label>
            <Input
              id="lateThreshold"
              type="number"
              min="1"
              value={config.lateThresholdMinutes}
              onChange={(e) => setConfig({ ...config, lateThresholdMinutes: parseInt(e.target.value) || 15 })}
            />
            <p className="text-xs text-muted-foreground">
              Durée après laquelle un retard est considéré comme une absence
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={loading}>
            <Save className="w-4 h-4 mr-2" />
            {loading ? "Enregistrement..." : "Enregistrer les paramètres"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default AttendanceSettings;
