import { useState } from "react";
import { compressImage } from "@/lib/imageCompression";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Upload, X, ImageOff, Sparkles } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { apiClient } from "@/api/client";
import { useToast } from "@/hooks/use-toast";
import { BrandingSectionProps } from "./BrandingTypes";
import { resolveUploadUrl } from "@/utils/url";

export function AIAssistantSection({ formData, setFormData }: BrandingSectionProps) {
    const { tenant } = useTenant();
    const { toast } = useToast();
    const [isUploading, setIsUploading] = useState(false);
    const [imgError, setImgError] = useState(false);

    const handleAvatarUpload = async (file: File) => {
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
            const compressed = await compressImage(file, { maxWidthOrHeight: 256, quality: 0.9, outputType: "image/webp" });
            const uploadFormData = new FormData();
            uploadFormData.append("file", compressed);

            const response = await apiClient.post("/storage/upload/", uploadFormData, {
                headers: { "Content-Type": "multipart/form-data" },
            });

            if (!response.data || !response.data.url) {
                throw new Error("L'upload a échoué");
            }

            setFormData(prev => ({ ...prev, ai_assistant_avatar_url: response.data.url }));
            setImgError(false);
            toast({ title: "Avatar téléchargé", description: "La photo de l'assistant IA a été mise à jour dans le formulaire." });
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
                        <Sparkles className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <CardTitle>Assistant IA</CardTitle>
                        <CardDescription>Personnalisez le nom et la photo de l'assistant du chatbot</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <div>
                    <Label className="text-base font-semibold mb-3 block">Photo de l'assistant</Label>
                    <div className="flex flex-col lg:flex-row gap-6">
                        <div className="flex-shrink-0">
                            <div className="w-24 h-24 rounded-full bg-muted border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
                                {formData.ai_assistant_avatar_url && !imgError ? (
                                    <img
                                        src={resolveUploadUrl(formData.ai_assistant_avatar_url)}
                                        alt="Aperçu de l'avatar de l'assistant IA"
                                        className="w-full h-full object-cover"
                                        onError={() => setImgError(true)}
                                        onLoad={() => setImgError(false)}
                                    />
                                ) : formData.ai_assistant_avatar_url && imgError ? (
                                    <div className="text-center text-muted-foreground p-2">
                                        <ImageOff className="w-6 h-6 mx-auto mb-1 text-amber-500" />
                                        <p className="text-[10px]">Inaccessible</p>
                                    </div>
                                ) : (
                                    <Sparkles className="w-8 h-8 text-primary/60" />
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
                                        if (file) handleAvatarUpload(file);
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
                                • Taille maximale: 5 MB (compressée automatiquement)<br />
                                • Si aucune photo n'est fournie, un avatar par défaut est utilisé
                            </p>
                            {formData.ai_assistant_avatar_url && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => { setFormData(prev => ({ ...prev, ai_assistant_avatar_url: "" })); setImgError(false); }}
                                    className="w-full sm:w-auto"
                                >
                                    <X className="w-4 h-4 mr-2" />
                                    Supprimer la photo
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="ai_assistant_name">Nom de l'assistant</Label>
                    <Input
                        id="ai_assistant_name"
                        value={formData.ai_assistant_name}
                        onChange={(e) => setFormData(prev => ({ ...prev, ai_assistant_name: e.target.value }))}
                        placeholder={`ex: Assistant IA · ${tenant?.name || "votre établissement"}`}
                    />
                    <p className="text-xs text-muted-foreground">
                        Affiché en en-tête du chatbot. Laissez vide pour utiliser "Assistant IA · {tenant?.name || "nom de l'établissement"}".
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
