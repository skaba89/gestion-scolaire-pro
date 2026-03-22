import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Bell, Save, Mail, AlertTriangle } from "lucide-react";

interface NotificationConfig {
  enableAbsenceAlerts: boolean;
  enableGradeAlerts: boolean;
  enablePaymentReminders: boolean;
  enableWeeklyReports: boolean;
  lowGradeThreshold: number;
  absenceAlertDelay: number;
  paymentReminderDays: number;
}

const NotificationSettings = () => {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<NotificationConfig>({
    enableAbsenceAlerts: true,
    enableGradeAlerts: true,
    enablePaymentReminders: true,
    enableWeeklyReports: false,
    lowGradeThreshold: 10,
    absenceAlertDelay: 0,
    paymentReminderDays: 7,
  });

  useEffect(() => {
    if (tenant?.settings) {
      const settings = tenant.settings as Record<string, any>;
      setConfig({
        enableAbsenceAlerts: settings.enableAbsenceAlerts ?? true,
        enableGradeAlerts: settings.enableGradeAlerts ?? true,
        enablePaymentReminders: settings.enablePaymentReminders ?? true,
        enableWeeklyReports: settings.enableWeeklyReports ?? false,
        lowGradeThreshold: settings.lowGradeThreshold ?? 10,
        absenceAlertDelay: settings.absenceAlertDelay ?? 0,
        paymentReminderDays: settings.paymentReminderDays ?? 7,
      });
    }
  }, [tenant]);

  const handleSave = async () => {
    if (!tenant) return;
    setLoading(true);

    try {
      const currentSettings = (tenant.settings as Record<string, any>) || {};
      const newSettings = { ...currentSettings, ...config };

      const { error } = await supabase
        .from("tenants")
        .update({
          settings: newSettings,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tenant.id);

      if (error) throw error;

      toast({
        title: "Paramètres enregistrés",
        description: "Les paramètres de notifications ont été mis à jour.",
      });
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
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
            <Bell className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>Paramètres de Notifications</CardTitle>
            <CardDescription>Configurez les alertes et notifications automatiques</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Absence Alerts */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <div>
              <Label className="text-base font-medium">Alertes d'absence</Label>
              <p className="text-sm text-muted-foreground">
                Envoyer un email aux parents quand un élève est absent
              </p>
            </div>
          </div>
          <Switch
            checked={config.enableAbsenceAlerts}
            onCheckedChange={(checked) => setConfig({ ...config, enableAbsenceAlerts: checked })}
          />
        </div>

        {config.enableAbsenceAlerts && (
          <div className="ml-8 p-4 rounded-lg border bg-muted/30">
            <div className="space-y-2">
              <Label htmlFor="absenceDelay">Délai avant envoi (en minutes)</Label>
              <Input
                id="absenceDelay"
                type="number"
                min="0"
                value={config.absenceAlertDelay}
                onChange={(e) => setConfig({ ...config, absenceAlertDelay: parseInt(e.target.value) || 0 })}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">
                0 = envoi immédiat
              </p>
            </div>
          </div>
        )}

        {/* Grade Alerts */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
          <div className="flex items-center gap-3">
            <Mail className="w-5 h-5 text-blue-500" />
            <div>
              <Label className="text-base font-medium">Alertes de notes</Label>
              <p className="text-sm text-muted-foreground">
                Notifier les parents quand une note est inférieure au seuil
              </p>
            </div>
          </div>
          <Switch
            checked={config.enableGradeAlerts}
            onCheckedChange={(checked) => setConfig({ ...config, enableGradeAlerts: checked })}
          />
        </div>

        {config.enableGradeAlerts && (
          <div className="ml-8 p-4 rounded-lg border bg-muted/30">
            <div className="space-y-2">
              <Label htmlFor="gradeThreshold">Seuil de note basse (/20)</Label>
              <Input
                id="gradeThreshold"
                type="number"
                min="0"
                max="20"
                value={config.lowGradeThreshold}
                onChange={(e) => setConfig({ ...config, lowGradeThreshold: parseInt(e.target.value) || 10 })}
                className="w-32"
              />
            </div>
          </div>
        )}

        {/* Payment Reminders */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
          <div className="flex items-center gap-3">
            <Mail className="w-5 h-5 text-green-500" />
            <div>
              <Label className="text-base font-medium">Rappels de paiement</Label>
              <p className="text-sm text-muted-foreground">
                Envoyer des rappels pour les factures impayées
              </p>
            </div>
          </div>
          <Switch
            checked={config.enablePaymentReminders}
            onCheckedChange={(checked) => setConfig({ ...config, enablePaymentReminders: checked })}
          />
        </div>

        {config.enablePaymentReminders && (
          <div className="ml-8 p-4 rounded-lg border bg-muted/30">
            <div className="space-y-2">
              <Label htmlFor="reminderDays">Jours avant échéance pour rappel</Label>
              <Input
                id="reminderDays"
                type="number"
                min="1"
                value={config.paymentReminderDays}
                onChange={(e) => setConfig({ ...config, paymentReminderDays: parseInt(e.target.value) || 7 })}
                className="w-32"
              />
            </div>
          </div>
        )}

        {/* Weekly Reports */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
          <div className="flex items-center gap-3">
            <Mail className="w-5 h-5 text-purple-500" />
            <div>
              <Label className="text-base font-medium">Rapports hebdomadaires</Label>
              <p className="text-sm text-muted-foreground">
                Envoyer un résumé hebdomadaire aux chefs de département
              </p>
            </div>
          </div>
          <Switch
            checked={config.enableWeeklyReports}
            onCheckedChange={(checked) => setConfig({ ...config, enableWeeklyReports: checked })}
          />
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

export default NotificationSettings;
