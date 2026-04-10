import { useState, useEffect, useRef } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PenTool, Save, Upload, Trash2, MapPin, MousePointer2 } from "lucide-react";
import SignaturePad from "@/components/ui/SignaturePad";
import {
  validateFile,
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZES
} from "@/utils/file-security";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";


const SignatureSettings = () => {
  const { tenant, setCurrentTenant } = useTenant();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    director_name: "",
    director_signature_url: "",
    secretary_name: "",
    secretary_signature_url: "",
    city: "",
  });
  const [drawingFor, setDrawingFor] = useState<"director" | "secretary" | null>(null);
  const [tempSignature, setTempSignature] = useState("");
  const directorInputRef = useRef<HTMLInputElement>(null);
  const secretaryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tenant) {
      const tenantData = tenant as typeof tenant & {
        director_name?: string;
        director_signature_url?: string;
        secretary_name?: string;
        secretary_signature_url?: string;
        city?: string;
      };
      setFormData({
        director_name: tenantData.director_name || "",
        director_signature_url: tenantData.director_signature_url || "",
        secretary_name: tenantData.secretary_name || "",
        secretary_signature_url: tenantData.secretary_signature_url || "",
        city: tenantData.city || "",
      });
    }
  }, [tenant]);

  const uploadSignature = async (fileOrBlob: File | Blob, type: "director" | "secretary") => {
    if (!tenant) return;

    const fileExt = fileOrBlob instanceof File ? fileOrBlob.name.split(".").pop() : "png";
    const fileName = `${tenant.id}/${type}-signature-${Date.now()}.${fileExt}`;

    const uploadFormData = new FormData();
    uploadFormData.append('file', fileOrBlob);
    uploadFormData.append('type', type);

    const uploadResponse = await apiClient.post('/storage/upload', uploadFormData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    if (!uploadResponse.data?.url) {
      toast.error('Erreur lors du téléchargement de la signature');
      return null;
    }

    return uploadResponse.data.url;
  };

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "director" | "secretary"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Security Validation
    const validation = validateFile(file, {
      allowedTypes: ALLOWED_FILE_TYPES.IMAGES,
      maxSize: MAX_FILE_SIZES.SIGNATURE
    });

    if (!validation.isValid) {
      toast.error(validation.error);
      return;
    }


    setLoading(true);
    const url = await uploadSignature(file, type);
    if (url) {
      setFormData((prev) => ({
        ...prev,
        [`${type}_signature_url`]: url,
      }));
      toast.success("Signature téléchargée");
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!tenant) return;
    setLoading(true);

    try {
      await apiClient.patch(`/tenants/${tenant.id}/`, {
        director_name: formData.director_name,
        director_signature_url: formData.director_signature_url,
        secretary_name: formData.secretary_name,
        secretary_signature_url: formData.secretary_signature_url,
        city: formData.city,
      });

      toast.success("Signatures et informations enregistrées");
      // Refresh tenant data
      if (tenant) {
        setCurrentTenant({ ...tenant, ...formData } as any);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.detail || error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignatureSave = async () => {
    if (!drawingFor || !tempSignature) return;

    setLoading(true);
    try {
      const base64Data = tempSignature.split(',')[1];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });

      const url = await uploadSignature(blob, drawingFor);
      if (url) {
        setFormData((prev) => ({
          ...prev,
          [`${drawingFor}_signature_url`]: url,
        }));
        toast.success("Signature enregistrée");
        setDrawingFor(null);
        setTempSignature("");
      }
    } catch (error) {
      toast.error("Erreur lors de l'enregistrement de la signature");
    } finally {
      setLoading(false);
    }
  };

  const clearSignature = (type: "director" | "secretary") => {
    setFormData((prev) => ({
      ...prev,
      [`${type}_signature_url`]: "",
    }));
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <PenTool className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Signatures Électroniques</CardTitle>
              <CardDescription>
                Configurez les signatures pour les documents officiels (attestations, bulletins)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="city" className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Ville (pour les documents officiels)
            </Label>
            <Input
              id="city"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              placeholder="Ex: Paris, Dakar, Abidjan..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Director Signature */}
            <div className="space-y-4 p-4 border rounded-lg">
              <h4 className="font-medium">Directeur/Directrice</h4>

              <div className="space-y-2">
                <Label htmlFor="director_name">Nom complet</Label>
                <Input
                  id="director_name"
                  value={formData.director_name}
                  onChange={(e) => setFormData({ ...formData, director_name: e.target.value })}
                  placeholder="M. Jean DUPONT"
                />
              </div>

              <div className="space-y-2">
                <Label>Signature</Label>
                {formData.director_signature_url ? (
                  <div className="relative border rounded-lg p-4 bg-muted/50">
                    <img
                      src={formData.director_signature_url}
                      alt="Signature du directeur"
                      className="h-16 object-contain mx-auto"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6"
                      onClick={() => clearSignature("director")}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div
                    onClick={() => directorInputRef.current?.click()}
                    className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  >
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Cliquez pour télécharger une signature
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      PNG ou JPG, fond transparent recommandé
                    </p>
                    <div className="mt-4 flex gap-2 justify-center">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDrawingFor("director");
                        }}
                      >
                        <MousePointer2 className="h-4 w-4 mr-2" />
                        Dessiner
                      </Button>
                    </div>
                  </div>
                )}
                <input
                  ref={directorInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileChange(e, "director")}
                />
              </div>
            </div>

            {/* Secretary Signature */}
            <div className="space-y-4 p-4 border rounded-lg">
              <h4 className="font-medium">Secrétaire Général(e)</h4>

              <div className="space-y-2">
                <Label htmlFor="secretary_name">Nom complet</Label>
                <Input
                  id="secretary_name"
                  value={formData.secretary_name}
                  onChange={(e) => setFormData({ ...formData, secretary_name: e.target.value })}
                  placeholder="Mme Marie MARTIN"
                />
              </div>

              <div className="space-y-2">
                <Label>Signature</Label>
                {formData.secretary_signature_url ? (
                  <div className="relative border rounded-lg p-4 bg-muted/50">
                    <img
                      src={formData.secretary_signature_url}
                      alt="Signature du secrétaire"
                      className="h-16 object-contain mx-auto"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6"
                      onClick={() => clearSignature("secretary")}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div
                    onClick={() => secretaryInputRef.current?.click()}
                    className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  >
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Cliquez pour télécharger une signature
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      PNG ou JPG, fond transparent recommandé
                    </p>
                    <div className="mt-4 flex gap-2 justify-center">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDrawingFor("secretary");
                        }}
                      >
                        <MousePointer2 className="h-4 w-4 mr-2" />
                        Dessiner
                      </Button>
                    </div>
                  </div>
                )}
                <input
                  ref={secretaryInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileChange(e, "secretary")}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={loading}>
              <Save className="w-4 h-4 mr-2" />
              {loading ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!drawingFor} onOpenChange={(open) => !open && setDrawingFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Signature manuscrite - {drawingFor === "director" ? "Directeur" : "Secrétaire"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <SignaturePad
              onSave={setTempSignature}
              placeholder="Signez ici avec votre souris ou votre doigt"
              className="border rounded-lg bg-white"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDrawingFor(null)}>Annuler</Button>
              <Button onClick={handleSignatureSave} disabled={loading || !tempSignature}>
                {loading ? "Enregistrement..." : "Confirmer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SignatureSettings;
