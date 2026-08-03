import { useEffect, useState } from "react";
import { apiClient } from "@/api/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MessageSquare, Info, CheckCircle2, Save, Send } from "lucide-react";
import { SecretInput, ChannelSection } from "./shared";

// Uses the dedicated GET/PATCH /notifications/settings/ and
// POST /notifications/whatsapp/test/ endpoints — unlike the other channels
// in NotificationSettings.tsx, this section never reads or round-trips a
// secret value through the browser. Fields the backend reports as
// "*Configured: true" show a masked placeholder; leaving a secret field
// blank on save means "keep the existing value", not "clear it".

interface WhatsAppServerSettings {
  whatsappEnabled: boolean;
  whatsappConfigured: boolean;
  whatsappPhoneId: string | null;
  whatsappBusinessAccountId: string | null;
  whatsappVerifyTokenConfigured: boolean;
  whatsappAppSecretConfigured: boolean;
  whatsappDefaultLanguage: string;
}

const MASKED_PLACEHOLDER = "•••••••• (déjà configuré — laissez vide pour ne pas changer)";

export function WhatsAppSettingsSection({
  onConfiguredChange,
}: {
  onConfiguredChange?: (configured: boolean) => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [server, setServer] = useState<WhatsAppServerSettings | null>(null);

  // Local editable fields — secrets start empty (server never sends them).
  const [enabled, setEnabled] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [phoneId, setPhoneId] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [defaultLanguage, setDefaultLanguage] = useState("fr");
  const [testPhone, setTestPhone] = useState("");

  const fetchSettings = async () => {
    try {
      const { data } = await apiClient.get<WhatsAppServerSettings>("/notifications/settings/");
      setServer(data);
      setEnabled(data.whatsappEnabled);
      setPhoneId(data.whatsappPhoneId || "");
      setBusinessAccountId(data.whatsappBusinessAccountId || "");
      setDefaultLanguage(data.whatsappDefaultLanguage || "fr");
      onConfiguredChange?.(data.whatsappConfigured);
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

  useEffect(() => {
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        whatsappEnabled: enabled,
        whatsappPhoneId: phoneId,
        whatsappBusinessAccountId: businessAccountId,
        whatsappDefaultLanguage: defaultLanguage,
      };
      // Only send a secret if the admin actually typed a new one — an empty
      // field means "leave the existing value untouched", not "clear it".
      if (accessToken) payload.whatsappAccessToken = accessToken;
      if (verifyToken) payload.whatsappVerifyToken = verifyToken;
      if (appSecret) payload.whatsappAppSecret = appSecret;

      await apiClient.patch("/notifications/settings/", payload);
      toast({
        title: "Paramètres WhatsApp enregistrés",
        description: "La configuration a été mise à jour.",
      });
      setAccessToken("");
      setVerifyToken("");
      setAppSecret("");
      await fetchSettings();
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testPhone) {
      toast({
        title: "Numéro requis",
        description: "Indiquez un numéro WhatsApp (format international, ex : +224623456789).",
        variant: "destructive",
      });
      return;
    }
    setTesting(true);
    try {
      await apiClient.post("/notifications/whatsapp/test/", { to_phone: testPhone });
      toast({
        title: "Message de test envoyé",
        description: `Vérifiez WhatsApp sur ${testPhone}.`,
      });
    } catch (error: any) {
      toast({
        title: "Échec de l'envoi",
        description: error.response?.data?.detail || error.message,
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const hasWhatsApp = Boolean(server?.whatsappConfigured);

  return (
    <ChannelSection
      icon={<MessageSquare className="w-5 h-5 text-green-600" />}
      title="WhatsApp Cloud API"
      badge="Gratuit · 1 000 conv/mois"
      badgeColor="border-green-500 text-green-700 bg-green-50"
      description="Envoie des messages WhatsApp aux parents via l'API officielle Meta"
      docsUrl="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
      defaultOpen={!loading && !hasWhatsApp}
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : (
        <>
          <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
            <div>
              <Label className="text-sm font-medium">Activer WhatsApp</Label>
              <p className="text-xs text-muted-foreground">
                Désactiver conserve la configuration mais arrête les envois
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {hasWhatsApp && (
            <Badge variant="outline" className="border-green-500 text-green-700 bg-green-50">
              <CheckCircle2 className="w-3 h-3 mr-1 text-green-500" />
              Token et numéro configurés
            </Badge>
          )}

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
            value={accessToken}
            onChange={setAccessToken}
            placeholder={server?.whatsappConfigured ? MASKED_PLACEHOLDER : "EAAxxxxxxxx..."}
            hint="Générez un token permanent dans les paramètres de l'app Meta"
          />

          <div className="space-y-1.5">
            <Label htmlFor="waPhoneId">Phone Number ID</Label>
            <Input
              id="waPhoneId"
              value={phoneId}
              onChange={(e) => setPhoneId(e.target.value)}
              placeholder="123456789012345"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Visible dans WhatsApp &gt; Configuration du numéro de téléphone
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="waBizId">Business Account ID (optionnel)</Label>
            <Input
              id="waBizId"
              value={businessAccountId}
              onChange={(e) => setBusinessAccountId(e.target.value)}
              placeholder="123456789012345"
              className="font-mono text-sm"
            />
          </div>

          <Separator />

          <div>
            <p className="text-sm font-medium mb-1">Webhook (statuts de livraison, messages entrants)</p>
            <p className="text-xs text-muted-foreground mb-3">
              À configurer côté Meta App → WhatsApp → Configuration → Webhook.
              URL : <code className="bg-muted px-1 rounded">{`${window.location.origin}/api-proxy/api/v1/whatsapp/webhook/`}</code>
            </p>
            <SecretInput
              id="waVerifyToken"
              label="Verify Token"
              value={verifyToken}
              onChange={setVerifyToken}
              placeholder={server?.whatsappVerifyTokenConfigured ? MASKED_PLACEHOLDER : "Choisissez une valeur secrète"}
              hint="Doit être identique côté Meta et ici"
            />
            <div className="mt-3">
              <SecretInput
                id="waAppSecret"
                label="App Secret (recommandé)"
                value={appSecret}
                onChange={setAppSecret}
                placeholder={server?.whatsappAppSecretConfigured ? MASKED_PLACEHOLDER : "Paramètres de l'app Meta → App Secret"}
                hint="Active la vérification de signature des webhooks entrants"
              />
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} size="sm">
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Enregistrement…" : "Enregistrer WhatsApp"}
          </Button>

          {hasWhatsApp && (
            <>
              <Separator />
              <div>
                <p className="text-sm font-medium mb-2">Envoyer un message de test</p>
                <div className="flex gap-2">
                  <Input
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="+224623456789"
                    className="font-mono text-sm max-w-xs"
                  />
                  <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
                    <Send className="w-4 h-4 mr-2" />
                    {testing ? "Envoi…" : "Tester WhatsApp"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </ChannelSection>
  );
}
