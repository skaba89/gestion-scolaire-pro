import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Palette } from "lucide-react";
import { BrandingSectionProps } from "./BrandingTypes";

const COLOR_OPTIONS = [
    { label: "Couleur Primaire", key: "primary_color", description: "Couleur principale de l'application" },
    { label: "Couleur Secondaire", key: "secondary_color", description: "Couleur pour les éléments secondaires" },
    { label: "Couleur Accent", key: "accent_color", description: "Couleur pour les éléments importants" },
] as const;

export function ColorSection({ formData, setFormData }: BrandingSectionProps) {
    const handleColorChange = (key: string, value: string) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Palette className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <CardTitle>Couleurs de l'application</CardTitle>
                        <CardDescription>Personnalisez l'apparence de votre portail</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                {COLOR_OPTIONS.map((color) => (
                    <div key={color.key} className="flex items-end gap-4">
                        <div className="flex-1">
                            <Label htmlFor={color.key} className="text-base font-semibold mb-2 block">
                                {color.label}
                            </Label>
                            <p className="text-sm text-muted-foreground mb-3">{color.description}</p>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    id={color.key}
                                    value={formData[color.key]}
                                    onChange={(e) => handleColorChange(color.key, e.target.value)}
                                    className="w-16 h-10 rounded-lg cursor-pointer border border-input"
                                />
                                <Input
                                    value={formData[color.key]}
                                    onChange={(e) => handleColorChange(color.key, e.target.value)}
                                    placeholder="#000000"
                                    className="flex-1"
                                />
                            </div>
                        </div>
                        <div
                            className="w-12 h-12 rounded-lg border-2 border-border flex-shrink-0"
                            style={{ backgroundColor: formData[color.key] }}
                            title={`Aperçu: ${formData[color.key]}`}
                        />
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
