import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Save, Upload } from "lucide-react";

const TENANT_TYPES = [
  { value: "primary", label: "École Primaire" },
  { value: "middle", label: "Collège" },
  { value: "high", label: "Lycée" },
  { value: "university", label: "Université" },
  { value: "training", label: "Centre de Formation" },
];

const EstablishmentSettings = () => {
  const { tenant, setCurrentTenant } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    type: "",
    email: "",
    phone: "",
    address: "",
    website: "",
  });

  useEffect(() => {
    if (tenant) {
      setFormData({
        name: tenant.name || "",
        type: tenant.type || "",
        email: tenant.email || "",
        phone: tenant.phone || "",
        address: tenant.address || "",
        website: tenant.website || "",
      });
    }
  }, [tenant]);

  const handleSave = async () => {
    if (!tenant) return;
    setLoading(true);

    try {
      const { error } = await supabase
        .from("tenants")
        .update({
          name: formData.name,
          type: formData.type,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
          website: formData.website,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tenant.id);

      if (error) throw error;

      if (setCurrentTenant) {
        setCurrentTenant({
          ...tenant,
          ...formData,
        } as any);
      }

      toast({
        title: "Modifications enregistrées",
        description: "Les informations de l'établissement ont été mises à jour.",
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
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>Informations de l'Établissement</CardTitle>
            <CardDescription>Modifiez les informations générales de votre établissement</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="name">Nom de l'établissement *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Nom de votre établissement"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Type d'établissement</Label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData({ ...formData, type: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner le type" />
              </SelectTrigger>
              <SelectContent>
                {TENANT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email de contact</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="contact@etablissement.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Téléphone</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+33 1 23 45 67 89"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Site web</Label>
            <Input
              id="website"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              placeholder="https://www.etablissement.com"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="address">Adresse</Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Adresse complète de l'établissement"
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={loading}>
            <Save className="w-4 h-4 mr-2" />
            {loading ? "Enregistrement..." : "Enregistrer les modifications"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default EstablishmentSettings;
