import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useSettings } from "@/hooks/useSettings";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { CURRENCIES } from "@/hooks/useCurrency";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wallet, Save, CreditCard, CheckCircle, Globe, Bell, AlertCircle, Smartphone } from "lucide-react";

interface FinanceConfig {
  currency: string;
  currencySymbol: string;
  enableOnlinePayments: boolean;
  bankName: string;
  bankAccount: string;
  bankIBAN: string;
  invoicePrefix: string;
  invoiceFooter: string;
  lateFeePercentage: number;
  gracePeriodDays: number;
  enableAutoReminders: boolean;
  reminderDaysBefore: number;
  penaltyType: "FIXED" | "PERCENTAGE";
  penaltyFrequency: "ONCE" | "MONTHLY";
  enableMobileMoney: boolean;
  paytechApiKey: string;
  paytechSecretKey: string;
}

const FinanceSettings = () => {
  const { settings, updateSettings, isLoading: isUpdating } = useSettings();
  const { toast } = useToast();
  const [formData, setFormData] = useState<Partial<FinanceConfig>>({});

  useEffect(() => {
    if (settings) {
      setFormData({
        currency: settings.currency || "XOF",
        currencySymbol: settings.currencySymbol || "FCFA",
        enableOnlinePayments: !!settings.enableOnlinePayments,
        bankName: settings.bankName || "",
        bankAccount: settings.bankAccount || "",
        bankIBAN: settings.bankIBAN || "",
        invoicePrefix: settings.invoicePrefix || "FAC-",
        invoiceFooter: settings.invoiceFooter || "",
        lateFeePercentage: settings.lateFeePercentage || 0,
        gracePeriodDays: settings.gracePeriodDays || 15,
        enableAutoReminders: !!settings.enableAutoReminders,
        reminderDaysBefore: settings.reminderDaysBefore || 7,
        penaltyType: (settings.penaltyType as any) || "PERCENTAGE",
        penaltyFrequency: (settings.penaltyFrequency as any) || "ONCE",
        enableMobileMoney: !!settings.enableMobileMoney,
        paytechApiKey: settings.paytechApiKey || "",
        paytechSecretKey: settings.paytechSecretKey || "",
      });
    }
  }, [settings]);

  const handleSave = async () => {
    try {
      await updateSettings(formData);
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>Paramètres Financiers</CardTitle>
            <CardDescription>Configurez les options de facturation et paiement</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Currency Settings */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            <Label className="text-base font-medium">Devise locale</Label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-lg border bg-muted/30">
            <div className="space-y-2">
              <Label htmlFor="currency">Devise</Label>
              <Select
                value={formData.currency}
                onValueChange={(value) => {
                  const currencyInfo = CURRENCIES[value];
                  setFormData({
                    ...formData,
                    currency: value,
                    currencySymbol: currencyInfo?.symbol || value
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {Object.values(CURRENCIES)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((currency) => (
                      <SelectItem key={currency.code} value={currency.code}>
                        {currency.name} ({currency.symbol})
                      </SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Devise utilisée pour toutes les transactions financières
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoicePrefix">Préfixe des factures</Label>
              <Input
                id="invoicePrefix"
                value={formData.invoicePrefix}
                onChange={(e) => setFormData({ ...formData, invoicePrefix: e.target.value })}
                placeholder="FAC-"
              />
              <p className="text-xs text-muted-foreground">
                Format: {formData.invoicePrefix}YYYYMM-#####
              </p>
            </div>
          </div>
        </div>

        {/* Bank Details */}
        <div className="space-y-4">
          <Label className="text-base font-medium">Coordonnées bancaires</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg border bg-muted/30">
            <div className="space-y-2">
              <Label htmlFor="bankName">Nom de la banque</Label>
              <Input
                id="bankName"
                value={formData.bankName}
                onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                placeholder="Banque Nationale"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankAccount">Numéro de compte</Label>
              <Input
                id="bankAccount"
                value={formData.bankAccount}
                onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })}
                placeholder="1234567890"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="bankIBAN">IBAN</Label>
              <Input
                id="bankIBAN"
                value={formData.bankIBAN}
                onChange={(e) => setFormData({ ...formData, bankIBAN: e.target.value })}
                placeholder="FR76 1234 5678 9012 3456 7890 123"
              />
            </div>
          </div>
        </div>

        {/* Automatic Reminders */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <Label className="text-base font-medium">Relances automatiques</Label>
              {formData.enableAutoReminders && (
                <Badge variant="outline" className="gap-1 bg-primary/10 text-primary border-primary/20">
                  <CheckCircle className="w-3 h-3" />
                  Activé
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Envoyer des rappels par email et notifications push avant l'échéance
            </p>
          </div>
          <Switch
            checked={formData.enableAutoReminders}
            onCheckedChange={(checked) => setFormData({ ...formData, enableAutoReminders: checked })}
          />
        </div>

        {formData.enableAutoReminders && (
          <div className="p-4 rounded-lg border bg-muted/30 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reminderDays">Premier rappel (jours avant échéance)</Label>
              <Input
                id="reminderDays"
                type="number"
                min="1"
                max="30"
                value={formData.reminderDaysBefore}
                onChange={(e) => setFormData({ ...formData, reminderDaysBefore: parseInt(e.target.value) || 7 })}
              />
              <p className="text-xs text-muted-foreground">
                Délai d'anticipation pour le premier rappel automatique
              </p>
            </div>
          </div>
        )}

        {/* Penalties & Late Fees */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-primary" />
            <Label className="text-base font-medium">Pénalités de retard</Label>
          </div>

          <div className="p-4 rounded-lg border bg-muted/30 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="gracePeriod">Délai de grâce (jours)</Label>
                <Input
                  id="gracePeriod"
                  type="number"
                  min="0"
                  value={formData.gracePeriodDays}
                  onChange={(e) => setFormData({ ...formData, gracePeriodDays: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">
                  Nombre de jours après l'échéance avant application des pénalités
                </p>
              </div>

              <div className="space-y-2">
                <Label>Type de pénalité</Label>
                <Select
                  value={formData.penaltyType}
                  onValueChange={(v: "FIXED" | "PERCENTAGE") => setFormData({ ...formData, penaltyType: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENTAGE">Pourcentage (%)</SelectItem>
                    <SelectItem value="FIXED">Montant fixe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="penaltyValue">
                  {formData.penaltyType === "PERCENTAGE" ? "Valeur (%)" : "Montant fixe"}
                </Label>
                <Input
                  id="penaltyValue"
                  type="number"
                  min="0"
                  step={formData.penaltyType === "PERCENTAGE" ? "0.1" : "1"}
                  value={formData.lateFeePercentage}
                  onChange={(e) => setFormData({ ...formData, lateFeePercentage: parseFloat(e.target.value) || 0 })}
                />
              </div>

              <div className="space-y-2">
                <Label>Fréquence d'application</Label>
                <Select
                  value={formData.penaltyFrequency}
                  onValueChange={(v: "ONCE" | "MONTHLY") => setFormData({ ...formData, penaltyFrequency: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ONCE">Une seule fois</SelectItem>
                    <SelectItem value="MONTHLY">Chaque mois de retard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Invoice Footer */}
        <div className="space-y-2">
          <Label htmlFor="invoiceFooter">Pied de page des factures</Label>
          <Textarea
            id="invoiceFooter"
            value={formData.invoiceFooter}
            onChange={(e) => setFormData({ ...formData, invoiceFooter: e.target.value })}
            placeholder="Mentions légales, conditions de paiement, etc."
            rows={3}
          />
        </div>

        {/* Mobile Money Payments */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-primary" />
              <Label className="text-base font-medium">Paiements Mobile Money</Label>
              {formData.enableMobileMoney && (
                <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-700 border-green-500/30">
                  <CheckCircle className="w-3 h-3" />
                  Actif
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Permettre aux parents de payer via Wave, Orange Money et MTN via PayTech
            </p>
          </div>
          <Switch
            checked={formData.enableMobileMoney}
            onCheckedChange={(checked) => setFormData({ ...formData, enableMobileMoney: checked })}
          />
        </div>

        {formData.enableMobileMoney && (
          <div className="p-4 rounded-lg border bg-muted/30 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="paytechApiKey">Clé API PayTech</Label>
                <Input
                  id="paytechApiKey"
                  type="password"
                  value={formData.paytechApiKey}
                  onChange={(e) => setFormData({ ...formData, paytechApiKey: e.target.value })}
                  placeholder="votre_api_key_paytech"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paytechSecretKey">Clé Secrète PayTech</Label>
                <Input
                  id="paytechSecretKey"
                  type="password"
                  value={formData.paytechSecretKey}
                  onChange={(e) => setFormData({ ...formData, paytechSecretKey: e.target.value })}
                  placeholder="votre_secret_key_paytech"
                />
              </div>
            </div>
          </div>
        )}

        {/* Online Payments (Stripe) */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              <Label className="text-base font-medium">Paiements par Carte Bancaire</Label>
              {formData.enableOnlinePayments && (
                <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-700 border-green-500/30">
                  <CheckCircle className="w-3 h-3" />
                  Actif
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Permettre les paiements par carte bancaire via Stripe
            </p>
          </div>
          <Switch
            checked={formData.enableOnlinePayments}
            onCheckedChange={(checked) => setFormData({ ...formData, enableOnlinePayments: checked })}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isUpdating}>
            <Save className="w-4 h-4 mr-2" />
            {isUpdating ? "Enregistrement..." : "Enregistrer les paramètres"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default FinanceSettings;
