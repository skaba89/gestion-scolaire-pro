import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Building2, UserPlus, GraduationCap, Shield } from "lucide-react";

const defaultLevels = [
  "CP", "CE1", "CE2", "CM1", "CM2",
  "6ème", "5ème", "4ème", "3ème",
  "Seconde", "Première", "Terminale",
];

const universityLevels = [
  "L1", "L2", "L3", "M1", "M2", "Doctorat",
];

const CreateTenantWithAdmin = () => {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Tenant fields
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [type, setType] = useState("school");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  // Admin user fields
  const [adminEmail, setAdminEmail] = useState("");
  const [adminFirstName, setAdminFirstName] = useState("");
  const [adminLastName, setAdminLastName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  if (!hasRole("SUPER_ADMIN")) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Shield className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Accès refusé</h2>
            <p className="text-muted-foreground">Cette page est réservée au Super Administrateur.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const generateSlug = (value: string) => {
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 50);
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slug || generateSlug(name) === slug) {
      setSlug(generateSlug(value));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !slug || !adminEmail || !adminFirstName || !adminLastName || !adminPassword) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }
    if (adminPassword.length < 8) {
      toast.error("Le mot de passe doit contenir au moins 8 caractères");
      return;
    }

    setLoading(true);
    try {
      // Determine levels based on type
      const levels = type === "university" ? universityLevels : defaultLevels;

      await apiClient.post("/tenants/create-with-admin/", {
        name,
        slug,
        type,
        email: email || null,
        phone: phone || null,
        address: address || null,
        admin_email: adminEmail,
        admin_first_name: adminFirstName,
        admin_last_name: adminLastName,
        admin_password: adminPassword,
        levels,
      });

      toast.success(`Établissement "${name}" créé avec succès !`);

      // Stay on the super admin dashboard — the new admin can log in separately
      navigate("/super-admin", { replace: true });
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Erreur lors de la création";
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/super-admin")} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour
        </Button>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="w-6 h-6 text-primary" />
          Nouvel établissement
        </h1>
        <p className="text-muted-foreground">
          Créez un nouvel établissement et son administrateur en une seule étape.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Tenant Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Informations de l'établissement
            </CardTitle>
            <CardDescription>
              Les données de base de l'établissement. Vous pourrez modifier les détails plus tard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nom *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Ex: Lycée Sainte-Marie"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slug">Slug (URL) *</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="lycee-sainte-marie"
                  required
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Utilisé dans l'URL : schoolflow.local/ecole/{slug || "..."}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="type">Type d'établissement *</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="school">École</SelectItem>
                  <SelectItem value="primary">École Primaire</SelectItem>
                  <SelectItem value="middle">Collège</SelectItem>
                  <SelectItem value="high">Lycée</SelectItem>
                  <SelectItem value="university">Université</SelectItem>
                  <SelectItem value="training">Centre de Formation</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="tenant-email">Email de l'établissement</Label>
                <Input
                  id="tenant-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@ecole.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tenant-phone">Téléphone</Label>
                <Input
                  id="tenant-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+224 6XX XX XX XX"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="address">Adresse</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Quartier, Ville, Pays"
              />
            </div>
          </CardContent>
        </Card>

        {/* Admin User */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Administrateur de l'établissement
            </CardTitle>
            <CardDescription>
              Cet utilisateur aura tous les droits de gestion sur l'établissement.
              Il pourra ensuite créer d'autres utilisateurs (enseignants, élèves, etc.).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="admin-firstname">Prénom *</Label>
                <Input
                  id="admin-firstname"
                  value={adminFirstName}
                  onChange={(e) => setAdminFirstName(e.target.value)}
                  placeholder="Jean"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-lastname">Nom *</Label>
                <Input
                  id="admin-lastname"
                  value={adminLastName}
                  onChange={(e) => setAdminLastName(e.target.value)}
                  placeholder="Dupont"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="admin-email">Email de l'admin *</Label>
              <Input
                id="admin-email"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@ecole.com"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="admin-password">Mot de passe *</Label>
              <Input
                id="admin-password"
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Minimum 8 caractères"
                required
                minLength={8}
              />
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        <Card className="bg-muted/50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <GraduationCap className="w-5 h-5 text-primary mt-0.5" />
              <div className="text-sm space-y-1">
                <p className="font-medium">Résumé de la création</p>
                <ul className="text-muted-foreground space-y-0.5">
                  <li>• Établissement : <strong>{name || "..."}</strong> ({getTypeLabel(type)})</li>
                  <li>• Niveaux créés automatiquement : {type === "university" ? universityLevels.join(", ") : defaultLevels.join(", ")}</li>
                  <li>• Année scolaire : 2025-2026</li>
                  <li>• Admin : <strong>{adminFirstName} {adminLastName}</strong> ({adminEmail || "..."})</li>
                  <li>• Rôle de l'admin : <strong>Administrateur de l'établissement</strong></li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/super-admin")}>
            Annuler
          </Button>
          <Button type="submit" disabled={loading} className="flex-1 sm:flex-none">
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Création en cours...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Créer l'établissement
              </span>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};

function getTypeLabel(type: string) {
  const map: Record<string, string> = {
    school: "École",
    primary: "École Primaire",
    middle: "Collège",
    high: "Lycée",
    university: "Université",
    training: "Centre de Formation",
  };
  return map[type] || type;
}

export default CreateTenantWithAdmin;
