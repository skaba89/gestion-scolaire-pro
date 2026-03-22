import { useState, useEffect } from "react";
import { useSettings } from "@/hooks/useSettings";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Save, RotateCcw, Loader2, LayoutDashboard, GraduationCap, Building2, Calendar, Activity, Wallet, Monitor, UsersIcon, Megaphone, Cog, BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

const MENU_SECTIONS = [
    { id: "overview", icon: LayoutDashboard },
    { id: "guides", icon: BookOpen },
    { id: "academicManagement", icon: GraduationCap },
    { id: "structure", icon: Building2 },
    { id: "planning", icon: Calendar },
    { id: "attendance", icon: Activity },
    { id: "financesSection", icon: Wallet },
    { id: "learning", icon: Monitor },
    { id: "studentLife", icon: UsersIcon },
    { id: "communication", icon: Megaphone },
    { id: "administration", icon: Cog },
];

export function MenuSettings() {
    const { t } = useTranslation();
    const { settings, updateSettings, isUpdating } = useSettings();
    const [menuConfig, setMenuConfig] = useState<Record<string, { enabled: boolean; label?: string }>>({});

    useEffect(() => {
        if (settings?.menu_config) {
            setMenuConfig(settings.menu_config);
        } else {
            // Initialize with default values
            const initialConfig: Record<string, { enabled: boolean }> = {};
            MENU_SECTIONS.forEach(s => {
                initialConfig[s.id] = { enabled: true };
            });
            setMenuConfig(initialConfig);
        }
    }, [settings]);

    const toggleSection = (id: string) => {
        setMenuConfig(prev => ({
            ...prev,
            [id]: { ...prev[id], enabled: !prev[id]?.enabled }
        }));
    };

    const updateLabel = (id: string, label: string) => {
        setMenuConfig(prev => ({
            ...prev,
            [id]: { ...prev[id], label }
        }));
    };

    const handleSave = async () => {
        await updateSettings({ menu_config: menuConfig });
    };

    const handleReset = () => {
        const initialConfig: Record<string, { enabled: boolean }> = {};
        MENU_SECTIONS.forEach(s => {
            initialConfig[s.id] = { enabled: true };
        });
        setMenuConfig(initialConfig);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Configuration du Menu</CardTitle>
                <CardDescription>
                    Personnalisez les sections visibles dans la barre latérale et modifiez leurs noms.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid gap-4">
                    {MENU_SECTIONS.map((section) => (
                        <div key={section.id} className="flex items-center justify-between p-4 rounded-xl border bg-muted/30 transition-all hover:bg-muted/50">
                            <div className="flex items-center gap-4 flex-1">
                                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <section.icon className="w-5 h-5 text-primary" />
                                </div>
                                <div className="flex-1 max-w-sm">
                                    <Label htmlFor={`label-${section.id}`} className="text-sm font-medium mb-1 block">
                                        {t(`nav.${section.id}`)}
                                    </Label>
                                    <Input
                                        id={`label-${section.id}`}
                                        value={menuConfig[section.id]?.label || ""}
                                        onChange={(e) => updateLabel(section.id, e.target.value)}
                                        placeholder={t(`nav.${section.id}`)}
                                        className="h-9"
                                        disabled={!menuConfig[section.id]?.enabled}
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Label htmlFor={`switch-${section.id}`} className="text-xs text-muted-foreground mr-2">
                                    {menuConfig[section.id]?.enabled ? "Activé" : "Désactivé"}
                                </Label>
                                <Switch
                                    id={`switch-${section.id}`}
                                    checked={menuConfig[section.id]?.enabled ?? true}
                                    onCheckedChange={() => toggleSection(section.id)}
                                />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex gap-3 justify-end pt-4">
                    <Button variant="outline" onClick={handleReset} disabled={isUpdating}>
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Réinitialiser par défaut
                    </Button>
                    <Button onClick={handleSave} disabled={isUpdating}>
                        {isUpdating ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Enregistrement...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4 mr-2" />
                                Enregistrer la configuration
                            </>
                        )}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
