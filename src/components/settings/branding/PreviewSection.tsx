import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Eye, X } from "lucide-react";
import { BrandingSectionProps } from "./BrandingTypes";

export function PreviewSection({ formData }: BrandingSectionProps) {
    const [showPreview, setShowPreview] = useState(false);

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Eye className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <CardTitle>Aperçu</CardTitle>
                        <CardDescription>Visualisez les modifications avant de sauvegarder</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <Button
                    variant="outline"
                    onClick={() => setShowPreview(!showPreview)}
                    className="w-full sm:w-auto"
                >
                    {showPreview ? "Masquer l'aperçu" : "Afficher l'aperçu"}
                </Button>

                {showPreview && (
                    <div className="mt-6 p-6 rounded-lg border-2 border-border space-y-4">
                        <div
                            className="p-4 rounded-lg flex items-center gap-4"
                            style={{ backgroundColor: `${formData.primary_color}20` }}
                        >
                            {formData.logo_url && (
                                <img src={formData.logo_url} alt="Logo" className="w-10 h-10 rounded object-contain" />
                            )}
                            <div>
                                <h3 className="font-bold" style={{ color: formData.primary_color }}>
                                    {formData.name}
                                </h3>
                                {formData.official_name && (
                                    <p className="text-sm opacity-75">{formData.official_name}</p>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <div
                                className="p-4 rounded-lg text-white text-center font-semibold text-sm"
                                style={{ backgroundColor: formData.primary_color }}
                            >
                                Primaire
                            </div>
                            <div
                                className="p-4 rounded-lg text-white text-center font-semibold text-sm"
                                style={{ backgroundColor: formData.secondary_color }}
                            >
                                Secondaire
                            </div>
                            <div
                                className="p-4 rounded-lg text-white text-center font-semibold text-sm"
                                style={{ backgroundColor: formData.accent_color }}
                            >
                                Accent
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
