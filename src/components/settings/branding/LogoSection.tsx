import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Upload, X, Loader2 } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { apiClient } from "@/api/client";
import { useToast } from "@/hooks/use-toast";
import { BrandingSectionProps } from "./BrandingTypes";
import { resolveUploadUrl } from "@/utils/url";

export function LogoSection({ formData, setFormData }: BrandingSectionProps) {
    const { tenant } = useTenant();
    const { toast } = useToast();
    const [isUploading, setIsUploading] = useState(false);

    const handleLogoUpload = async (file: File) => {
        if (!tenant?.id) return;

        if (!file.type.startsWith("image/")) {
            toast({ title: "Erreur", description: "Veuillez sélectionner une image", variant: "destructive" });
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            toast({ title: "Erreur", description: "L'image doit faire moins de 5MB", variant: "destructive" });
            return;
        }

        setIsUploading(true);
        try {
            const uploadFormData = new FormData();
            uploadFormData.append("file", file);

            const response = await apiClient.post("/storage/upload", uploadFormData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                },
            });

            if (!response.data || !response.data.url) {
                throw new Error("L'upload a échoué");
            }

            setFormData(prev => ({ ...prev, logo_url: response.data.url }));
            toast({ title: "Logo téléchargé", description: "Le logo a été mis à jour dans le formulaire." });
        } catch (error: any) {
            toast({ title: "Erreur", description: error.response?.data?.detail || error.message, variant: "destructive" });
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Upload className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <CardTitle>Identité Visuelle</CardTitle>
                        <CardDescription>Logo et nom de votre établissement</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <div>
                    <Label className="text-base font-semibold mb-3 block">Logo de l'établissement</Label>
                    <div className="flex flex-col lg:flex-row gap-6">
                        <div className="flex-shrink-0">
                            <div className="w-32 h-32 rounded-xl bg-muted border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
                                {formData.logo_url ? (
                                    <img src={resolveUploadUrl(formData.logo_url)} alt="Logo preview" className="w-full h-full object-contain" />
                                ) : (
                                    <div className="text-center text-muted-foreground">
                                        <Upload className="w-8 h-8 mx-auto mb-2" />
                                        <p className="text-xs">Pas de logo</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 space-y-4">
                            <div>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleLogoUpload(file);
                                    }}
                                    disabled={isUploading}
                                    className="block w-full text-sm text-muted-foreground
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-lg file:border-0
                    file:text-sm file:font-semibold
                    file:bg-primary file:text-primary-foreground
                    hover:file:bg-primary/90
                    disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                • Formats acceptés: PNG, JPG, GIF, WebP<br />
                                • Taille maximale: 5 MB<br />
                                • Résolution recommandée: 400×400px
                            </p>
                            {formData.logo_url && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setFormData(prev => ({ ...prev, logo_url: "" }))}
                                    className="w-full sm:w-auto"
                                >
                                    <X className="w-4 h-4 mr-2" />
                                    Supprimer le logo
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Nom court</Label>
                        <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="ex: École ABC"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="official_name">Nom officiel</Label>
                        <Input
                            id="official_name"
                            value={formData.official_name}
                            onChange={(e) => setFormData(prev => ({ ...prev, official_name: e.target.value }))}
                            placeholder="ex: École Primaire ABC de Dakar"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <input
                        type="checkbox"
                        id="show_logo_text"
                        checked={formData.show_logo_text}
                        onChange={(e) => setFormData(prev => ({ ...prev, show_logo_text: e.target.checked }))}
                        className="rounded border-input"
                    />
                    <Label htmlFor="show_logo_text" className="cursor-pointer">
                        Afficher le texte du logo avec l'image
                    </Label>
                </div>
            </CardContent>
        </Card>
    );
}
