import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ShieldCheck, Save, GraduationCap, Clock, Scale } from "lucide-react";

const SaaSSettings = () => {
    const { tenant } = useTenant();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [settings, setSettings] = useState({
        education_mode: "SCHOOL",
        grading_system: "NUMERIC",
        grading_scale_max: 20,
        rounding_rule: "NEAREST_HALF",
        period_type: "TRIMESTER",
        attendance_mode: "SESSION",
        resit_enabled: false,
        compensation_enabled: false,
        justification_deadline_days: 7,
        two_man_rule_enabled: false,
    });

    useEffect(() => {
        const fetchSettings = async () => {
            if (!tenant) return;
            const { data, error } = await supabase
                .from("school_settings")
                .select("*")
                .eq("tenant_id", tenant.id)
                .maybeSingle();

            if (error) {
                console.error("Error fetching school settings:", error);
            }

            if (data) {
                console.log("School settings loaded:", data);
                setSettings({
                    education_mode: data.education_mode || "SCHOOL",
                    grading_system: data.grading_system || "NUMERIC",
                    grading_scale_max: Number(data.grading_scale_max) || 20,
                    rounding_rule: data.rounding_rule || "NEAREST_HALF",
                    period_type: data.period_type || "TRIMESTER",
                    attendance_mode: data.attendance_mode || "SESSION",
                    resit_enabled: data.resit_enabled || false,
                    compensation_enabled: data.compensation_enabled || false,
                    justification_deadline_days: data.justification_deadline_days || 7,
                    two_man_rule_enabled: data.two_man_rule_enabled || false,
                });
            } else {
                console.log("No school settings found, using defaults for tenant:", tenant.id);
            }
        };

        fetchSettings();
    }, [tenant]);

    const handleSave = async () => {
        if (!tenant) return;
        setLoading(true);

        try {
            const { error } = await supabase
                .from("school_settings")
                .upsert({
                    tenant_id: tenant.id,
                    ...settings,
                    updated_at: new Date().toISOString(),
                });

            if (error) throw error;

            toast({
                title: "Paramètres de gouvernance mis à jour",
                description: "Les règles métier de votre établissement ont été enregistrées.",
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
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <ShieldCheck className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <CardTitle>Gouvernance & Modèle Métier</CardTitle>
                            <CardDescription>Configurez les règles fondamentales de votre plateforme SaaS</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Education Mode */}
                        <div className="space-y-2">
                            <Label>Mode d'Éducation</Label>
                            <Select
                                value={settings.education_mode}
                                onValueChange={(v) => setSettings({ ...settings, education_mode: v })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="SCHOOL">École (Primaire/Secondaire)</SelectItem>
                                    <SelectItem value="UNIVERSITY">Université (LMD/Crédits)</SelectItem>
                                    <SelectItem value="HYBRID">Hybride / Formation Pro</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">Impacte le vocabulaire (Classe vs Groupe) et les options académiques.</p>
                        </div>

                        {/* Period Type */}
                        <div className="space-y-2">
                            <Label>Type de Périodes</Label>
                            <Select
                                value={settings.period_type}
                                onValueChange={(v) => setSettings({ ...settings, period_type: v })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="TRIMESTER">Trimestres</SelectItem>
                                    <SelectItem value="SEMESTER">Semestres</SelectItem>
                                    <SelectItem value="TERM">Termes / Sessions</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Grading System */}
                        <div className="space-y-4 border-t pt-4 md:col-span-2">
                            <div className="flex items-center gap-2 mb-2">
                                <GraduationCap className="w-4 h-4 text-primary" />
                                <h4 className="text-sm font-semibold uppercase tracking-wider">Système de Notation</h4>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label>Note Maximale</Label>
                                    <Input
                                        type="number"
                                        value={settings.grading_scale_max}
                                        onChange={(e) => setSettings({ ...settings, grading_scale_max: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Règle d'Arrondi</Label>
                                    <Select
                                        value={settings.rounding_rule}
                                        onValueChange={(v) => setSettings({ ...settings, rounding_rule: v })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="NEAREST_HALF">Au demi point (0.5)</SelectItem>
                                            <SelectItem value="NEAREST_WHOLE">À l'entier (1.0)</SelectItem>
                                            <SelectItem value="NEAREST_TENTH">Au dixième (0.1)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>

                        {/* Advanced Workflow */}
                        <div className="space-y-4 border-t pt-4 md:col-span-2">
                            <div className="flex items-center gap-2 mb-2">
                                <Scale className="w-4 h-4 text-primary" />
                                <h4 className="text-sm font-semibold uppercase tracking-wider">Workflows & Robustesse</h4>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                                <div className="flex items-center justify-between space-x-2">
                                    <div className="space-y-0.5">
                                        <Label>Rattrapages (Resit)</Label>
                                        <p className="text-xs text-muted-foreground">Autoriser les sessions de rattrapage.</p>
                                    </div>
                                    <Switch
                                        checked={settings.resit_enabled}
                                        onCheckedChange={(v) => setSettings({ ...settings, resit_enabled: v })}
                                    />
                                </div>
                                <div className="flex items-center justify-between space-x-2">
                                    <div className="space-y-0.5">
                                        <Label>Compensation (LMD)</Label>
                                        <p className="text-xs text-muted-foreground">Calculer les moyennes par compensation d'UE.</p>
                                    </div>
                                    <Switch
                                        checked={settings.compensation_enabled}
                                        onCheckedChange={(v) => setSettings({ ...settings, compensation_enabled: v })}
                                    />
                                </div>
                                <div className="flex items-center justify-between space-x-2">
                                    <div className="space-y-0.5">
                                        <Label>Double Validation (4-Eyes)</Label>
                                        <p className="text-xs text-muted-foreground">Nécessite deux approbations pour les actions critiques.</p>
                                    </div>
                                    <Switch
                                        checked={settings.two_man_rule_enabled}
                                        onCheckedChange={(v) => setSettings({ ...settings, two_man_rule_enabled: v })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Délai Justification Absence (jours)</Label>
                                    <Input
                                        type="number"
                                        value={settings.justification_deadline_days}
                                        onChange={(e) => setSettings({ ...settings, justification_deadline_days: Number(e.target.value) })}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end pt-6">
                        <Button onClick={handleSave} disabled={loading}>
                            <Save className="w-4 h-4 mr-2" />
                            {loading ? "Enregistrement..." : "Enregistrer la Gouvernance"}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default SaaSSettings;
