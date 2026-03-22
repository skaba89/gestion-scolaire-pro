import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Hash, RefreshCw } from "lucide-react";

interface MatriculeConfig {
  prefix: string;
  includeYear: boolean;
  yearFormat: "full" | "short";
  sequenceLength: number;
  autoGenerate: boolean;
  currentSequence: number;
  useDepartmentCode?: boolean;
}

const MatriculeSettings = () => {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<MatriculeConfig>({
    prefix: "ETU",
    includeYear: true,
    yearFormat: "full",
    sequenceLength: 4,
    autoGenerate: true,
    currentSequence: 1,
    useDepartmentCode: false,
  });

  useEffect(() => {
    if (tenant?.settings) {
      const settings = tenant.settings as Record<string, unknown>;
      if (settings.matricule) {
        setConfig({ ...config, ...(settings.matricule as Partial<MatriculeConfig>) });
      }
    }
  }, [tenant]);

  const handleSave = async () => {
    if (!tenant) return;
    setLoading(true);

    try {
      const currentSettings = (tenant.settings as Record<string, unknown>) || {};
      const newSettings = {
        ...currentSettings,
        matricule: JSON.parse(JSON.stringify(config)),
      };
      const { error } = await supabase
        .from("tenants")
        .update({
          settings: newSettings,
        })
        .eq("id", tenant.id);

      if (error) throw error;

      toast({
        title: "Configuration sauvegardée",
        description: "Les paramètres des numéros d'étudiants ont été mis à jour.",
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

  const generatePreview = () => {
    const year = config.includeYear
      ? config.yearFormat === "full"
        ? new Date().getFullYear().toString()
        : new Date().getFullYear().toString().slice(-2)
      : "";
    const sequence = config.currentSequence.toString().padStart(config.sequenceLength, "0");
    const prefix = config.useDepartmentCode ? "INFO" : config.prefix;

    if (config.useDepartmentCode) {
      return `${prefix}-${year}-${sequence}`;
    }
    return `${prefix}${year}${sequence}`;
  };

  const resetSequence = async () => {
    if (!tenant) return;
    if (!confirm("Êtes-vous sûr de vouloir réinitialiser la séquence à 1 ?")) return;

    setConfig({ ...config, currentSequence: 1 });

    try {
      const currentSettings = (tenant.settings as Record<string, unknown>) || {};
      const newSettings = {
        ...currentSettings,
        matricule: JSON.parse(JSON.stringify({ ...config, currentSequence: 1 })),
      };
      await supabase
        .from("tenants")
        .update({
          settings: newSettings,
        })
        .eq("id", tenant.id);

      toast({
        title: "Séquence réinitialisée",
        description: "La séquence des numéros d'étudiants a été remise à 1.",
      });
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
            <Hash className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>Configuration des Numéros d'Étudiants</CardTitle>
            <CardDescription>
              Définissez le format de génération automatique des numéros d'étudiants (matricules)
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Preview */}
        <div className="p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground mb-1">Aperçu du numéro d'étudiant</p>
          <p className="text-2xl font-mono font-bold text-primary">{generatePreview()}</p>
        </div>

        {/* Auto Generate */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Génération automatique</Label>
            <p className="text-sm text-muted-foreground">
              Générer automatiquement les numéros d'étudiants lors de l'inscription
            </p>
          </div>
          <Switch
            checked={config.autoGenerate}
            onCheckedChange={(checked) => setConfig({ ...config, autoGenerate: checked })}
          />
        </div>

        {/* Use Department Code */}
        <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg border border-primary/20">
          <div className="space-y-0.5">
            <Label className="text-primary font-semibold">Utiliser le code département</Label>
            <p className="text-sm text-muted-foreground">
              Le numéro d'étudiant sera au format : CODE_DEPT-ANNEE-SEQUENCE (ex: INFO-2026-0001)
            </p>
          </div>
          <Switch
            checked={config.useDepartmentCode}
            onCheckedChange={(checked) => setConfig({ ...config, useDepartmentCode: checked })}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Prefix */}
          <div className="space-y-2">
            <Label>Préfixe</Label>
            <Input
              value={config.prefix}
              onChange={(e) => setConfig({ ...config, prefix: e.target.value.toUpperCase() })}
              placeholder="ETU"
              maxLength={10}
            />
            <p className="text-xs text-muted-foreground">Ex: ETU, STU, ELEVE</p>
          </div>

          {/* Sequence Length */}
          <div className="space-y-2">
            <Label>Longueur de la séquence</Label>
            <Input
              type="number"
              min={3}
              max={8}
              value={config.sequenceLength}
              onChange={(e) => setConfig({ ...config, sequenceLength: parseInt(e.target.value) || 4 })}
            />
            <p className="text-xs text-muted-foreground">Nombre de chiffres (ex: 4 = 0001)</p>
          </div>
        </div>

        {/* Include Year */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Inclure l'année</Label>
            <p className="text-sm text-muted-foreground">
              Ajouter l'année dans le numéro d'étudiant
            </p>
          </div>
          <Switch
            checked={config.includeYear}
            onCheckedChange={(checked) => setConfig({ ...config, includeYear: checked })}
          />
        </div>

        {config.includeYear && (
          <div className="space-y-2">
            <Label>Format de l'année</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="yearFormat"
                  checked={config.yearFormat === "full"}
                  onChange={() => setConfig({ ...config, yearFormat: "full" })}
                  className="text-primary"
                />
                <span className="text-sm">Complet (2024)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="yearFormat"
                  checked={config.yearFormat === "short"}
                  onChange={() => setConfig({ ...config, yearFormat: "short" })}
                  className="text-primary"
                />
                <span className="text-sm">Court (24)</span>
              </label>
            </div>
          </div>
        )}

        {/* Current Sequence */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div>
            <Label>Séquence actuelle</Label>
            <p className="text-2xl font-bold">{config.currentSequence}</p>
          </div>
          <Button variant="outline" size="sm" onClick={resetSequence}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Réinitialiser
          </Button>
        </div>

        <Button onClick={handleSave} disabled={loading} className="w-full">
          {loading ? "Enregistrement..." : "Enregistrer les paramètres"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default MatriculeSettings;
