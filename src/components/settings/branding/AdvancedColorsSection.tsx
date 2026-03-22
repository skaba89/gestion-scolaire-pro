import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Palette } from "lucide-react";
import { BrandingSectionProps } from "./BrandingTypes";

export function AdvancedColorsSection({ formData, setFormData }: BrandingSectionProps) {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Palette className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <CardTitle>Couleurs détaillées</CardTitle>
                        <CardDescription>Personnalisez les menus et les onglets</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                        <Label>Couleur Active (Menu)</Label>
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                value={formData.menu_active_color}
                                onChange={(e) => setFormData(p => ({ ...p, menu_active_color: e.target.value }))}
                                className="w-12 h-10 cursor-pointer"
                            />
                            <Input
                                value={formData.menu_active_color}
                                onChange={(e) => setFormData(p => ({ ...p, menu_active_color: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Fond du Menu</Label>
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                value={formData.menu_bg_color}
                                onChange={(e) => setFormData(p => ({ ...p, menu_bg_color: e.target.value }))}
                                className="w-12 h-10 cursor-pointer"
                            />
                            <Input
                                value={formData.menu_bg_color}
                                onChange={(e) => setFormData(p => ({ ...p, menu_bg_color: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Couleur Active (Onglets)</Label>
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                value={formData.tab_active_color}
                                onChange={(e) => setFormData(p => ({ ...p, tab_active_color: e.target.value }))}
                                className="w-12 h-10 cursor-pointer"
                            />
                            <Input
                                value={formData.tab_active_color}
                                onChange={(e) => setFormData(p => ({ ...p, tab_active_color: e.target.value }))}
                            />
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
