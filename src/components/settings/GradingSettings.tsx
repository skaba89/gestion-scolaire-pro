import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GraduationCap, Save, Plus, Trash2 } from "lucide-react";

interface GradeScale {
  min: number;
  max: number;
  label: string;
  appreciation: string;
}

interface GradingConfig {
  maxScore: number;
  passingScore: number;
  useLetterGrades: boolean;
  showRank: boolean;
  showClassAverage: boolean;
  gradeScale: GradeScale[];
  remedialThreshold: number;
  defaultExamWeight: number;
  defaultTestWeight: number;
  enableRemedial: boolean;
}

const defaultGradeScale: GradeScale[] = [
  { min: 16, max: 20, label: "A", appreciation: "Excellent" },
  { min: 14, max: 15.99, label: "B", appreciation: "Très Bien" },
  { min: 12, max: 13.99, label: "C", appreciation: "Bien" },
  { min: 10, max: 11.99, label: "D", appreciation: "Assez Bien" },
  { min: 8, max: 9.99, label: "E", appreciation: "Passable" },
  { min: 0, max: 7.99, label: "F", appreciation: "Insuffisant" },
];

const GradingSettings = () => {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<GradingConfig>({
    maxScore: 20,
    passingScore: 10,
    useLetterGrades: false,
    showRank: true,
    showClassAverage: true,
    gradeScale: defaultGradeScale,
    remedialThreshold: 8,
    defaultExamWeight: 0.6,
    defaultTestWeight: 0.4,
    enableRemedial: false,
  });

  useEffect(() => {
    if (tenant?.settings) {
      const settings = tenant.settings as Record<string, any>;
      setConfig({
        maxScore: settings.maxScore ?? 20,
        passingScore: settings.passingScore ?? 10,
        useLetterGrades: settings.useLetterGrades ?? false,
        showRank: settings.showRank ?? true,
        showClassAverage: settings.showClassAverage ?? true,
        gradeScale: settings.gradeScale ?? defaultGradeScale,
        remedialThreshold: settings.remedialThreshold ?? 8,
        defaultExamWeight: settings.defaultExamWeight ?? 0.6,
        defaultTestWeight: settings.defaultTestWeight ?? 0.4,
        enableRemedial: settings.enableRemedial ?? false,
      });
    }
  }, [tenant]);

  const handleSave = async () => {
    if (!tenant) return;
    setLoading(true);

    try {
      const currentSettings = (tenant.settings as Record<string, any>) || {};
      const newSettings = { ...currentSettings, ...config, gradeScale: JSON.parse(JSON.stringify(config.gradeScale)) };

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
        description: "Les paramètres de notation ont été mis à jour.",
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

  const updateGradeScale = (index: number, field: keyof GradeScale, value: string | number) => {
    const newScale = [...config.gradeScale];
    newScale[index] = { ...newScale[index], [field]: value };
    setConfig({ ...config, gradeScale: newScale });
  };

  const addGradeLevel = () => {
    setConfig({
      ...config,
      gradeScale: [...config.gradeScale, { min: 0, max: 0, label: "", appreciation: "" }],
    });
  };

  const removeGradeLevel = (index: number) => {
    const newScale = config.gradeScale.filter((_, i) => i !== index);
    setConfig({ ...config, gradeScale: newScale });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>Paramètres de Notation</CardTitle>
            <CardDescription>Configurez le système de notation et les bulletins</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Basic Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="maxScore">Note maximale</Label>
            <Select
              value={config.maxScore.toString()}
              onValueChange={(value) => setConfig({ ...config, maxScore: parseInt(value) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">Sur 20</SelectItem>
                <SelectItem value="100">Sur 100</SelectItem>
                <SelectItem value="10">Sur 10</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="passingScore">Note de passage</Label>
            <Input
              id="passingScore"
              type="number"
              min="0"
              max={config.maxScore}
              value={config.passingScore}
              onChange={(e) => setConfig({ ...config, passingScore: parseFloat(e.target.value) || 0 })}
            />
          </div>
        </div>

        {/* Toggle Options */}
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
            <div>
              <Label className="text-base font-medium">Afficher le classement</Label>
              <p className="text-sm text-muted-foreground">
                Afficher le rang de l'élève dans les bulletins
              </p>
            </div>
            <Switch
              checked={config.showRank}
              onCheckedChange={(checked) => setConfig({ ...config, showRank: checked })}
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
            <div>
              <Label className="text-base font-medium">Afficher la moyenne de classe</Label>
              <p className="text-sm text-muted-foreground">
                Inclure la moyenne de la classe pour chaque matière
              </p>
            </div>
            <Switch
              checked={config.showClassAverage}
              onCheckedChange={(checked) => setConfig({ ...config, showClassAverage: checked })}
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
            <div>
              <Label className="text-base font-medium">Session de rattrapage</Label>
              <p className="text-sm text-muted-foreground">
                Activer la gestion automatique des rattrapages pour les élèves sous le seuil
              </p>
            </div>
            <Switch
              checked={config.enableRemedial}
              onCheckedChange={(checked) => setConfig({ ...config, enableRemedial: checked })}
            />
          </div>

          {config.enableRemedial && (
            <div className="p-4 rounded-lg border bg-muted/30 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="remedialThreshold">Seuil d'éligibilité au rattrapage</Label>
                <Input
                  id="remedialThreshold"
                  type="number"
                  step="0.1"
                  value={config.remedialThreshold}
                  onChange={(e) => setConfig({ ...config, remedialThreshold: parseFloat(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">Les élèves ayant une moyenne entre ce seuil et la note de passage seront éligibles.</p>
              </div>
            </div>
          )}

          <div className="p-4 rounded-lg border bg-card space-y-4">
            <Label className="text-base font-medium">Pondérations par défaut</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="examWeight">Poids Examens (0.0 à 1.0)</Label>
                <Input
                  id="examWeight"
                  type="number"
                  step="0.1"
                  max="1"
                  min="0"
                  value={config.defaultExamWeight}
                  onChange={(e) => setConfig({ ...config, defaultExamWeight: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="testWeight">Poids Devoirs (0.0 à 1.0)</Label>
                <Input
                  id="testWeight"
                  type="number"
                  step="0.1"
                  max="1"
                  min="0"
                  value={config.defaultTestWeight}
                  onChange={(e) => setConfig({ ...config, defaultTestWeight: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Ces valeurs sont utilisées si aucun poids spécifique n'est défini sur une évaluation.</p>
          </div>
        </div>

        {/* Grade Scale */}
        {config.useLetterGrades && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Échelle de notation</Label>
              <Button variant="outline" size="sm" onClick={addGradeLevel}>
                <Plus className="w-4 h-4 mr-2" />
                Ajouter un niveau
              </Button>
            </div>
            <div className="space-y-3">
              {config.gradeScale.map((level, index) => (
                <div key={index} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <div className="flex-1 grid grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Min</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={level.min}
                        onChange={(e) => updateGradeScale(index, "min", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Max</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={level.max}
                        onChange={(e) => updateGradeScale(index, "max", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Lettre</Label>
                      <Input
                        value={level.label}
                        onChange={(e) => updateGradeScale(index, "label", e.target.value)}
                        maxLength={2}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Appréciation</Label>
                      <Input
                        value={level.appreciation}
                        onChange={(e) => updateGradeScale(index, "appreciation", e.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeGradeLevel(index)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

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

export default GradingSettings;
