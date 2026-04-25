import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Bell, Save, Mail, AlertTriangle, MessageSquare,
  Smartphone, ExternalLink, Eye, EyeOff, CheckCircle2,
  Info, ChevronDown, ChevronUp, Radio
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type SmsProvider = "android_gateway" | "africastalking" | "";

interface NotificationConfig {
  // Behavioral toggles
  enableAbsenceAlerts: boolean;
  enableGradeAlerts: boolean;
  enablePaymentReminders: boolean;
  enableWeeklyReports: boolean;
  lowGradeThreshold: number;
  absenceAlertDelay: number;
  paymentReminderDays: number;
  // WhatsApp Cloud API
  whatsappAccessToken: string;
  whatsappPhoneId: string;
  // OneSignal Push
  oneSignalAppId: string;
  oneSignalApiKey: string;
  // SMS
  smsProvider: SmsProvider;
  androidSmsGatewayUrl: string;
  androidSmsGatewayToken: string;
  africastalkingUsername: string;
  africastalkingApiKey: string;
  africastalkingSenderId: string;
  // Email delivery
  resendApiKey: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  fromEmail: string;
  fromName: string;
}

const DEFAULT_CONFIG: NotificationConfig = {
  enableAbsenceAlerts: true,
  enableGradeAlerts: true,
  enablePaymentReminders: true,
  enableWeeklyReports: false,
  lowGradeThreshold: 10,
  absenceAlertDelay: 0,
  paymentReminderDays: 7,
  whatsappAccessToken: "",
  whatsappPhoneId: "",
  oneSignalAppId: "",
  oneSignalApiKey: "",
  smsProvider: "",
  androidSmsGatewayUrl: "",
  androidSmsGatewayToken: "",
  africastalkingUsername: "",
  africastalkingApiKey: "",
  africastalkingSenderId: "",
  resendApiKey: "",
  smtpHost: "",
  smtpPort: 587,
  smtpUser: "",
  smtpPass: "",
  fromEmail: "",
  fromName: "",
};

// ── Sub-components ─────────────────────────────────────────────────────────────

const SecretInput = ({
  id, label, value, onChange, placeholder, hint,
}: {
  id: string; label: string; value: string;
  onChange: (v: string) => void; placeholder?: string; hint?: string;
}) => {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-10 font-mono text-sm"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
};

const ChannelSection = ({
  icon, title, badge, badgeColor, description, docsUrl, children, defaultOpen = false,
}: {
  icon: React.ReactNode; title: string; badge?: string; badgeColor?: string;
  description: string; docsUrl?: string; children: React.ReactNode; defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex-1 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{title}</span>
              {badge && (
                <Badge variant="outline" className={`text-xs ${badgeColor}`}>
                  {badge}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {docsUrl && (
            <a
              href={docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Docs <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t bg-muted/10 pt-4 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────

const NotificationSettings = () => {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [config, setConfig] = useState<NotificationConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    if (tenant?.settings) {
      const s = tenant.settings as Record<string, any>;
      setConfig({
        enableAbsenceAlerts: s.enableAbsenceAlerts ?? true,
        enableGradeAlerts: s.enableGradeAlerts ?? true,
        enablePaymentReminders: s.enablePaymentReminders ?? true,
        enableWeeklyReports: s.enableWeeklyReports ?? false,
        lowGradeThreshold: s.lowGradeThreshold ?? 10,
        absenceAlertDelay: s.absenceAlertDelay ?? 0,
        paymentReminderDays: s.paymentReminderDays ?? 7,
        whatsappAccessToken: s.whatsappAccessToken ?? "",
        whatsappPhoneId: s.whatsappPhoneId ?? "",
        oneSignalAppId: s.oneSignalAppId ?? "",
        oneSignalApiKey: s.oneSignalApiKey ?? "",
        smsProvider: s.smsProvider ?? "",
        androidSmsGatewayUrl: s.androidSmsGatewayUrl ?? "",
        androidSmsGatewayToken: s.androidSmsGatewayToken ?? "",
        africastalkingUsername: s.africastalkingUsername ?? "",
        africastalkingApiKey: s.africastalkingApiKey ?? "",
        africastalkingSenderId: s.africastalkingSenderId ?? "",
        resendApiKey: s.resendApiKey ?? "",
        smtpHost: s.smtpHost ?? "",
        smtpPort: s.smtpPort ?? 587,
        smtpUser: s.smtpUser ?? "",
        smtpPass: s.smtpPass ?? "",
        fromEmail: s.fromEmail ?? "",
        fromName: s.fromName ?? "",
      });
    }
  }, [tenant]);

  const set = (partial: Partial<NotificationConfig>) =>
    setConfig((prev) => ({ ...prev, ...partial }));

  const handleSave = async () => {
    if (!tenant) return;
    setLoading(true);
    try {
      const currentSettings = (tenant.settings as Record<string, any>) || {};
      await apiClient.patch(`/tenants/${tenant.id}/`, {
        settings: { ...currentSettings, ...config },
      });
      toast({
        title: "Paramètres enregistrés",
        description: "Les canaux de notification ont été mis à jour.",
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

  const handleTestChannel = async (type: string) => {
    setTestingChannel(type);
    try {
      const payload: Record<string, any> = { type: `test_${type}` };
      if (type === "whatsapp" || type === "email" || type === "sms") {
        payload.recipientEmail = tenant?.email || "";
        payload.recipientPhone = "+2250000000000"; // use admin phone in production
        payload.recipientName = "Admin Test";
        payload.data = { student_name: "Test Élève", school_name: tenant?.name };
      }
      await apiClient.post("/communication/send-notification-email/", payload);
      toast({
        title: `Test ${type} envoyé`,
        description: "Vérifiez votre appareil / boîte mail / téléphone.",
      });
    } catch (error: any) {
      toast({
        title: "Erreur de test",
        description: error.response?.data?.detail || error.message,
        variant: "destructive",
      });
    } finally {
      setTestingChannel(null);
    }
  };

  const hasWhatsApp = Boolean(config.whatsappAccessToken && config.whatsappPhoneId);
  const hasOneSignal = Boolean(config.oneSignalAppId && config.oneSignalApiKey);
  const hasSms = Boolean(
    (config.smsProvider === "android_gateway" && config.androidSmsGatewayUrl) ||
    (config.smsProvider === "africastalking" && config.africastalkingApiKey && config.africastalkingUsername)
  );
  const hasEmail = Boolean(config.resendApiKey || (config.smtpHost && config.smtpUser));

  return (
    <div className="space-y-6">
      {/* ── Behavioral Toggles ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Alertes automatiques</CardTitle>
              <CardDescription>Quand envoyer des notifications aux parents et élèves</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Absences */}
          <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              <div>
                <Label className="text-base font-medium">Alertes d'absence</Label>
                <p className="text-sm text-muted-foreground">
                  Notifier les parents quand un élève est absent
                </p>
              </div>
            </div>
            <Switch
              checked={config.enableAbsenceAlerts}
              onCheckedChange={(v) => set({ enableAbsenceAlerts: v })}
            />
          </div>
          {config.enableAbsenceAlerts && (
            <div className="ml-8 p-4 rounded-lg border bg-muted/30 space-y-2">
              <Label htmlFor="absenceDelay">Délai avant envoi (minutes)</Label>
              <Input
                id="absenceDelay"
                type="number"
                min="0"
                value={config.absenceAlertDelay}
                onChange={(e) => set({ absenceAlertDelay: parseInt(e.target.value) || 0 })}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">0 = envoi immédiat</p>
            </div>
          )}

          {/* Grades */}
          <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-blue-500" />
              <div>
                <Label className="text-base font-medium">Alertes de notes basses</Label>
                <p className="text-sm text-muted-foreground">
                  Notifier quand une note passe sous le seuil
                </p>
              </div>
            </div>
            <Switch
              checked={config.enableGradeAlerts}
              onCheckedChange={(v) => set({ enableGradeAlerts: v })}
            />
          </div>
          {config.enableGradeAlerts && (
            <div className="ml-8 p-4 rounded-lg border bg-muted/30 space-y-2">
              <Label htmlFor="gradeThreshold">Seuil de note basse (/20)</Label>
              <Input
                id="gradeThreshold"
                type="number"
                min="0"
                max="20"
                value={config.lowGradeThreshold}
                onChange={(e) => set({ lowGradeThreshold: parseInt(e.target.value) || 10 })}
                className="w-32"
              />
            </div>
          )}

          {/* Payment reminders */}
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
              onCheckedChange={(v) => set({ enablePaymentReminders: v })}
            />
          </div>
          {config.enablePaymentReminders && (
            <div className="ml-8 p-4 rounded-lg border bg-muted/30 space-y-2">
              <Label htmlFor="reminderDays">Jours avant échéance pour rappel</Label>
              <Input
                id="reminderDays"
                type="number"
                min="1"
                value={config.paymentReminderDays}
                onChange={(e) => set({ paymentReminderDays: parseInt(e.target.value) || 7 })}
                className="w-32"
              />
            </div>
          )}

          {/* Weekly reports */}
          <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-purple-500" />
              <div>
                <Label className="text-base font-medium">Rapports hebdomadaires</Label>
                <p className="text-sm text-muted-foreground">
                  Résumé hebdomadaire pour les chefs de département
                </p>
              </div>
            </div>
            <Switch
              checked={config.enableWeeklyReports}
              onCheckedChange={(v) => set({ enableWeeklyReports: v })}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Delivery Channels ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <CardTitle>Canaux de livraison</CardTitle>
              <CardDescription>
                Les messages sont envoyés dans cet ordre : WhatsApp → Push → SMS → Email
              </CardDescription>
            </div>
          </div>

          {/* Status badges */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Badge
              variant="outline"
              className={hasWhatsApp ? "border-green-500 text-green-700 bg-green-50" : "text-muted-foreground"}
            >
              <CheckCircle2 className={`w-3 h-3 mr-1 ${hasWhatsApp ? "text-green-500" : "text-muted-foreground"}`} />
              WhatsApp
            </Badge>
            <Badge
              variant="outline"
              className={hasOneSignal ? "border-red-500 text-red-700 bg-red-50" : "text-muted-foreground"}
            >
              <CheckCircle2 className={`w-3 h-3 mr-1 ${hasOneSignal ? "text-red-500" : "text-muted-foreground"}`} />
              OneSignal Push
            </Badge>
            <Badge
              variant="outline"
              className={hasSms ? "border-orange-500 text-orange-700 bg-orange-50" : "text-muted-foreground"}
            >
              <CheckCircle2 className={`w-3 h-3 mr-1 ${hasSms ? "text-orange-500" : "text-muted-foreground"}`} />
              SMS
            </Badge>
            <Badge
              variant="outline"
              className={hasEmail ? "border-blue-500 text-blue-700 bg-blue-50" : "text-muted-foreground"}
            >
              <CheckCircle2 className={`w-3 h-3 mr-1 ${hasEmail ? "text-blue-500" : "text-muted-foreground"}`} />
              Email
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* ── WhatsApp Cloud API ─────────────────────────────────── */}
          <ChannelSection
            icon={<MessageSquare className="w-5 h-5 text-green-600" />}
            title="WhatsApp Cloud API"
            badge="Gratuit · 1 000 conv/mois"
            badgeColor="border-green-500 text-green-700 bg-green-50"
            description="Envoie des messages WhatsApp aux parents via l'API officielle Meta"
            docsUrl="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
            defaultOpen={!hasWhatsApp}
          >
            <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50 border border-blue-200">
              <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <div className="text-xs text-blue-700 space-y-1">
                <p className="font-medium">Comment obtenir vos clés :</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Créez une app sur <strong>developers.facebook.com</strong></li>
                  <li>Ajoutez le produit <strong>WhatsApp</strong></li>
                  <li>Copiez le <strong>Phone Number ID</strong> et le <strong>Token d'accès permanent</strong></li>
                  <li>Vérifiez votre numéro d'entreprise</li>
                </ol>
              </div>
            </div>

            <SecretInput
              id="waToken"
              label="Token d'accès permanent"
              value={config.whatsappAccessToken}
              onChange={(v) => set({ whatsappAccessToken: v })}
              placeholder="EAAxxxxxxxx..."
              hint="Générez un token permanent dans les paramètres de l'app Meta"
            />
            <div className="space-y-1.5">
              <Label htmlFor="waPhoneId">Phone Number ID</Label>
              <Input
                id="waPhoneId"
                value={config.whatsappPhoneId}
                onChange={(e) => set({ whatsappPhoneId: e.target.value })}
                placeholder="123456789012345"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Visible dans WhatsApp &gt; Configuration du numéro de téléphone
              </p>
            </div>
            {hasWhatsApp && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTestChannel("whatsapp")}
                disabled={testingChannel === "whatsapp"}
              >
                {testingChannel === "whatsapp" ? "Envoi..." : "Tester WhatsApp"}
              </Button>
            )}
          </ChannelSection>

          {/* ── OneSignal Push ─────────────────────────────────────── */}
          <ChannelSection
            icon={<Smartphone className="w-5 h-5 text-red-500" />}
            title="OneSignal Push Notifications"
            badge="Gratuit · 10 000 abonnés"
            badgeColor="border-red-400 text-red-700 bg-red-50"
            description="Notifications push dans l'application mobile et PWA"
            docsUrl="https://documentation.onesignal.com/docs/keys-and-ids"
            defaultOpen={!hasOneSignal}
          >
            <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50 border border-blue-200">
              <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <div className="text-xs text-blue-700 space-y-1">
                <p className="font-medium">Comment configurer :</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Créez un compte sur <strong>onesignal.com</strong></li>
                  <li>Créez une nouvelle app → choisissez la plateforme</li>
                  <li>Copiez l'<strong>App ID</strong> et la <strong>REST API Key</strong></li>
                  <li>Ajoutez <code className="bg-blue-100 px-1 rounded">VITE_ONESIGNAL_APP_ID</code> dans votre <code className="bg-blue-100 px-1 rounded">.env</code></li>
                </ol>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="osAppId">App ID</Label>
              <Input
                id="osAppId"
                value={config.oneSignalAppId}
                onChange={(e) => set({ oneSignalAppId: e.target.value })}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="font-mono text-sm"
              />
            </div>
            <SecretInput
              id="osApiKey"
              label="REST API Key"
              value={config.oneSignalApiKey}
              onChange={(v) => set({ oneSignalApiKey: v })}
              placeholder="os_v2_app_xxxxxxxx..."
              hint="Paramètres de l'app OneSignal → Keys & IDs → REST API Key"
            />
          </ChannelSection>

          {/* ── SMS ───────────────────────────────────────────────── */}
          <ChannelSection
            icon={<Radio className="w-5 h-5 text-orange-500" />}
            title="SMS (Android Gateway / Africa's Talking)"
            badge="100 % gratuit disponible"
            badgeColor="border-orange-400 text-orange-700 bg-orange-50"
            description="Envoie des SMS via un vieux téléphone Android ou Africa's Talking"
            docsUrl="https://developers.africastalking.com/docs/sms/sending"
            defaultOpen={!hasSms}
          >
            {/* Provider selector */}
            <div className="space-y-2">
              <Label>Fournisseur SMS</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(
                  [
                    { value: "", label: "Désactivé", desc: "Pas de SMS" },
                    {
                      value: "android_gateway",
                      label: "Android Gateway",
                      desc: "Vieux téléphone + SIM locale (100 % gratuit)",
                    },
                    {
                      value: "africastalking",
                      label: "Africa's Talking",
                      desc: "Sandbox gratuit · ~0,004 $/SMS",
                    },
                  ] as { value: SmsProvider; label: string; desc: string }[]
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set({ smsProvider: opt.value })}
                    className={`text-left p-3 rounded-lg border-2 transition-colors ${
                      config.smsProvider === opt.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/40"
                    }`}
                  >
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Android SMS Gateway fields */}
            {config.smsProvider === "android_gateway" && (
              <div className="space-y-4 pt-2">
                <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200">
                  <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-xs text-amber-700 space-y-1">
                    <p className="font-medium">Setup Android SMS Gateway (gratuit) :</p>
                    <ol className="list-decimal list-inside space-y-0.5">
                      <li>Installez <strong>Android SMS Gateway</strong> (capcom5) sur un vieux téléphone Android avec une SIM active</li>
                      <li>Lancez l'app → notez l'URL locale (ex : <code className="bg-amber-100 px-1 rounded">http://192.168.1.42:8080</code>)</li>
                      <li>Ou créez un compte sur <strong>sms.capcom5.me</strong> pour accès cloud (sans IP fixe)</li>
                      <li>Copiez le <strong>Token</strong> affiché dans l'app</li>
                    </ol>
                    <p className="mt-1">
                      <a
                        href="https://github.com/capcom5/android-sms-gateway"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline font-medium"
                      >
                        github.com/capcom5/android-sms-gateway ↗
                      </a>
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="gwUrl">URL de la gateway</Label>
                  <Input
                    id="gwUrl"
                    value={config.androidSmsGatewayUrl}
                    onChange={(e) => set({ androidSmsGatewayUrl: e.target.value })}
                    placeholder="http://192.168.1.42:8080  ou  https://sms.capcom5.me"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    URL locale (réseau interne) ou relay cloud
                  </p>
                </div>
                <SecretInput
                  id="gwToken"
                  label="Token d'authentification"
                  value={config.androidSmsGatewayToken}
                  onChange={(v) => set({ androidSmsGatewayToken: v })}
                  placeholder="Laissez vide si aucun mot de passe n'est configuré"
                  hint="Visible dans l'app Android SMS Gateway → Paramètres"
                />

                {hasSms && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestChannel("sms")}
                    disabled={testingChannel === "sms"}
                  >
                    {testingChannel === "sms" ? "Envoi..." : "Tester Android Gateway"}
                  </Button>
                )}
              </div>
            )}

            {/* Africa's Talking fields */}
            {config.smsProvider === "africastalking" && (
              <div className="space-y-4 pt-2">
                <div className="flex items-start gap-2 p-3 rounded-md bg-green-50 border border-green-200">
                  <Info className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                  <div className="text-xs text-green-700 space-y-1">
                    <p className="font-medium">Africa's Talking — Couverture francophone :</p>
                    <p>🇬🇳 Guinée · 🇸🇳 Sénégal · 🇨🇮 Côte d'Ivoire · 🇲🇱 Mali · 🇧🇫 Burkina Faso · 🇨🇲 Cameroun · 🇹🇬 Togo · 🇲🇦 Maroc + 8 autres pays</p>
                    <ol className="list-decimal list-inside space-y-0.5 mt-1">
                      <li>Inscrivez-vous sur <strong>africastalking.com</strong></li>
                      <li>Créez une app → copiez l'<strong>API Key</strong></li>
                      <li>Pour tester : Username = <code className="bg-green-100 px-1 rounded">sandbox</code></li>
                      <li>En production : basculez sur votre vrai username + activez "Live"</li>
                    </ol>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="atUsername">Username</Label>
                    <Input
                      id="atUsername"
                      value={config.africastalkingUsername}
                      onChange={(e) => set({ africastalkingUsername: e.target.value })}
                      placeholder="sandbox  ou  mon_username"
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Utilisez "sandbox" pour les tests
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="atSenderId">Sender ID (optionnel)</Label>
                    <Input
                      id="atSenderId"
                      value={config.africastalkingSenderId}
                      onChange={(e) => set({ africastalkingSenderId: e.target.value })}
                      placeholder="SCHOOLFLOW"
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Nom affiché (doit être enregistré chez AT)
                    </p>
                  </div>
                </div>
                <SecretInput
                  id="atApiKey"
                  label="API Key"
                  value={config.africastalkingApiKey}
                  onChange={(v) => set({ africastalkingApiKey: v })}
                  placeholder="atsk_xxxxxxxxxxxxxxxxxxxxxxxx"
                  hint="Dashboard Africa's Talking → Settings → API Key"
                />

                {hasSms && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestChannel("sms")}
                    disabled={testingChannel === "sms"}
                  >
                    {testingChannel === "sms" ? "Envoi..." : "Tester Africa's Talking"}
                  </Button>
                )}
              </div>
            )}
          </ChannelSection>

          {/* ── Email ─────────────────────────────────────────────── */}
          <ChannelSection
            icon={<Mail className="w-5 h-5 text-blue-600" />}
            title="Email (Brevo / Resend / SMTP)"
            badge="Brevo : 300/jour gratuit"
            badgeColor="border-blue-400 text-blue-700 bg-blue-50"
            description="Fallback email via Resend API ou votre propre serveur SMTP"
            docsUrl="https://resend.com/docs/introduction"
            defaultOpen={!hasEmail}
          >
            <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200">
              <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-700">
                <strong>Priorité :</strong> Si une clé Resend est renseignée, elle est utilisée en priorité.
                Sinon le SMTP est utilisé. Brevo est compatible SMTP (host: smtp-relay.brevo.com, port 587).
              </div>
            </div>

            {/* Resend */}
            <div>
              <p className="text-sm font-medium mb-3">Option A — Resend API (recommandé)</p>
              <SecretInput
                id="resendKey"
                label="Resend API Key"
                value={config.resendApiKey}
                onChange={(v) => set({ resendApiKey: v })}
                placeholder="re_xxxxxxxxxxxx"
                hint="3 000 emails/mois gratuits sur resend.com"
              />
            </div>

            <Separator />

            {/* SMTP */}
            <div>
              <p className="text-sm font-medium mb-3">Option B — SMTP (Brevo, Gmail, SendGrid…)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="smtpHost">Serveur SMTP</Label>
                  <Input
                    id="smtpHost"
                    value={config.smtpHost}
                    onChange={(e) => set({ smtpHost: e.target.value })}
                    placeholder="smtp-relay.brevo.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtpPort">Port</Label>
                  <Input
                    id="smtpPort"
                    type="number"
                    value={config.smtpPort}
                    onChange={(e) => set({ smtpPort: parseInt(e.target.value) || 587 })}
                    placeholder="587"
                    className="w-full"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="smtpUser">Utilisateur SMTP</Label>
                  <Input
                    id="smtpUser"
                    value={config.smtpUser}
                    onChange={(e) => set({ smtpUser: e.target.value })}
                    placeholder="votre@email.com"
                  />
                </div>
                <SecretInput
                  id="smtpPass"
                  label="Mot de passe SMTP"
                  value={config.smtpPass}
                  onChange={(v) => set({ smtpPass: v })}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <Separator />

            {/* Sender identity */}
            <div>
              <p className="text-sm font-medium mb-3">Identité de l'expéditeur</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="fromEmail">Email expéditeur</Label>
                  <Input
                    id="fromEmail"
                    type="email"
                    value={config.fromEmail}
                    onChange={(e) => set({ fromEmail: e.target.value })}
                    placeholder="noreply@ecole.edu"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fromName">Nom affiché</Label>
                  <Input
                    id="fromName"
                    value={config.fromName}
                    onChange={(e) => set({ fromName: e.target.value })}
                    placeholder="École Jean Moulin"
                  />
                </div>
              </div>
            </div>

            {hasEmail && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTestChannel("email")}
                disabled={testingChannel === "email"}
              >
                {testingChannel === "email" ? "Envoi..." : "Tester l'email"}
              </Button>
            )}
          </ChannelSection>

        </CardContent>
      </Card>

      {/* ── Save ─────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={loading} size="lg">
          <Save className="w-4 h-4 mr-2" />
          {loading ? "Enregistrement..." : "Enregistrer tous les paramètres"}
        </Button>
      </div>
    </div>
  );
};

export default NotificationSettings;
