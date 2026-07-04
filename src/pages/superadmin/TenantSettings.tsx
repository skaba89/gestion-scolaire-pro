import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  ArrowLeft, Building2, Save, Loader2, Palette, Globe, CreditCard,
  MapPin, Image, Phone, Mail, BookOpen, Settings, Shield, FileText
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  type: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
  currency: string;
  timezone: string | null;
  is_active: boolean;
  created_at: string;
  settings: Record<string, any> | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CURRENCIES = [
  { code: "GNF", label: "Franc Guinéen (FG)" },
  { code: "XOF", label: "Franc CFA (FCFA)" },
  { code: "EUR", label: "Euro (€)" },
  { code: "USD", label: "Dollar US ($)" },
  { code: "GBP", label: "Livre Sterling (£)" },
  { code: "MAD", label: "Dirham Marocain (MAD)" },
  { code: "TND", label: "Dinar Tunisien (TND)" },
  { code: "XAF", label: "Franc CFA CEMAC" },
  { code: "CAD", label: "Dollar Canadien (CAD)" },
  { code: "CHF", label: "Franc Suisse (CHF)" },
];

const TENANT_TYPES = [
  { value: "primary", label: "École Primaire" },
  { value: "middle", label: "Collège" },
  { value: "high", label: "Lycée" },
  { value: "university", label: "Université" },
  { value: "school", label: "École" },
  { value: "training", label: "Centre de Formation" },
];

const TIMEZONES = [
  { value: "Africa/Conakry", label: "Conakry (GMT+0)" },
  { value: "Africa/Dakar", label: "Dakar (GMT+0)" },
  { value: "Africa/Abidjan", label: "Abidjan (GMT+0)" },
  { value: "Africa/Lagos", label: "Lagos (GMT+1)" },
  { value: "Africa/Douala", label: "Douala (GMT+1)" },
  { value: "Africa/Casablanca", label: "Casablanca (GMT+1)" },
  { value: "Africa/Tunis", label: "Tunis (GMT+1)" },
  { value: "Europe/Paris", label: "Paris (GMT+1/+2)" },
  { value: "America/Montreal", label: "Montréal (GMT-5/-4)" },
  { value: "UTC", label: "UTC" },
];

const LANGUAGES = [
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "ar", label: "العربية" },
  { value: "zh", label: "中文" },
];

const COLOR_PRESETS = [
  { name: "Bleu classique", primary: "#1e3a5f", secondary: "#64748b" },
  { name: "Indigo", primary: "#4f46e5", secondary: "#6366f1" },
  { name: "Vert émeraude", primary: "#059669", secondary: "#10b981" },
  { name: "Rouge bordeaux", primary: "#991b1b", secondary: "#dc2626" },
  { name: "Violet", primary: "#7c3aed", secondary: "#8b5cf6" },
  { name: "Orange", primary: "#ea580c", secondary: "#f97316" },
  { name: "Teal", primary: "#0d9488", secondary: "#14b8a6" },
  { name: "Bleu marine", primary: "#1e40af", secondary: "#3b82f6" },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function TenantSettings() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Form state
  const [form, setForm] = useState({
    name: "",
    type: "university",
    email: "",
    phone: "",
    address: "",
    city: "",
    country: "",
    website: "",
    currency: "GNF",
    timezone: "Africa/Conakry",
  });

  const [settings, setSettings] = useState({
    primary_color: "#1e3a5f",
    secondary_color: "#64748b",
    language: "fr",
    tagline: "",
    school_motto: "",
    description: "",
    academic_system: "semester",
    grading_scale: "20",
    logo_url: "",
    favicon_url: "",
    official_name: "",
  });

  const { data: tenant, isLoading } = useQuery<TenantDetail>({
    queryKey: ["tenant-detail", tenantId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/tenants/${tenantId}/`);
      return data;
    },
    enabled: !!tenantId,
  });

  // Populate form when tenant loads
  useEffect(() => {
    if (tenant) {
      setForm({
        name: tenant.name || "",
        type: tenant.type || "university",
        email: tenant.email || "",
        phone: tenant.phone || "",
        address: tenant.address || "",
        city: tenant.city || "",
        country: tenant.country || "",
        website: tenant.website || "",
        currency: tenant.currency || "GNF",
        timezone: tenant.timezone || "Africa/Conakry",
      });

      const s = tenant.settings || {};
      setSettings({
        primary_color: s.primary_color || s.landing?.primary_color || "#1e3a5f",
        secondary_color: s.secondary_color || s.landing?.secondary_color || "#64748b",
        language: s.language || "fr",
        tagline: s.landing?.tagline || s.tagline || "",
        school_motto: s.landing?.school_motto || s.school_motto || "",
        description: s.landing?.description || s.description || "",
        academic_system: s.academic_system || "semester",
        grading_scale: s.grading_scale || "20",
        logo_url: s.logo_url || s.landing?.logo_url || "",
        favicon_url: s.favicon_url || "",
        official_name: s.official_name || "",
      });
    }
  }, [tenant]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const currentSettings = tenant?.settings || {};
      const updatedSettings = {
        ...currentSettings,
        primary_color: settings.primary_color,
        secondary_color: settings.secondary_color,
        language: settings.language,
        tagline: settings.tagline,
        school_motto: settings.school_motto,
        description: settings.description,
        academic_system: settings.academic_system,
        grading_scale: settings.grading_scale,
        logo_url: settings.logo_url || undefined,
        favicon_url: settings.favicon_url || undefined,
        official_name: settings.official_name || undefined,
        // Also update landing section for the auth page branding
        landing: {
          ...(currentSettings.landing || {}),
          primary_color: settings.primary_color,
          secondary_color: settings.secondary_color,
          tagline: settings.tagline,
          school_motto: settings.school_motto,
          description: settings.description,
          logo_url: settings.logo_url || undefined,
        },
      };

      await apiClient.patch(`/tenants/${tenantId}/`, {
        name: form.name,
        type: form.type,
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
        city: form.city || undefined,
        country: form.country || undefined,
        website: form.website || undefined,
        currency: form.currency,
        timezone: form.timezone,
        settings: updatedSettings,
      });
    },
    onSuccess: () => {
      toast.success("Paramètres enregistrés avec succès");
      queryClient.invalidateQueries({ queryKey: ["tenant-detail", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["super-admin-tenants"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Erreur lors de l'enregistrement");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
          <p className="text-muted-foreground">Chargement des paramètres...</p>
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="p-8 text-center">
        <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Établissement introuvable</h2>
        <Button variant="outline" onClick={() => navigate("/super-admin")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Retour
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/super-admin")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Settings className="w-6 h-6 text-primary" />
              Paramètres — {tenant.name}
            </h1>
            <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
              <code className="bg-muted px-2 py-0.5 rounded text-xs">{tenant.slug}</code>
              <Badge variant={tenant.is_active ? "default" : "secondary"}>
                {tenant.is_active ? "Actif" : "Inactif"}
              </Badge>
            </p>
          </div>
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="gap-2"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer
        </Button>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-4">
          <TabsTrigger value="general" className="gap-2">
            <Building2 className="w-4 h-4 hidden sm:block" />
            Général
          </TabsTrigger>
          <TabsTrigger value="branding" className="gap-2">
            <Palette className="w-4 h-4 hidden sm:block" />
            Apparence
          </TabsTrigger>
          <TabsTrigger value="locale" className="gap-2">
            <Globe className="w-4 h-4 hidden sm:block" />
            Localisation
          </TabsTrigger>
          <TabsTrigger value="academic" className="gap-2">
            <BookOpen className="w-4 h-4 hidden sm:block" />
            Académique
          </TabsTrigger>
        </TabsList>

        {/* ═══ TAB: Général ═══════════════════════════════════════════════════ */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Informations de l'établissement
              </CardTitle>
              <CardDescription>Identité et coordonnées</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nom de l'établissement *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Université La Source"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nom officiel</Label>
                  <Input
                    value={settings.official_name}
                    onChange={(e) => setSettings({ ...settings, official_name: e.target.value })}
                    placeholder="Nom complet officiel"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Type d'établissement</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TENANT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" /> Email
                  </Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="contact@universite.edu.gn"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" /> Téléphone
                  </Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+224 XXX XXX XXX"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" /> Adresse
                </Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Quartier, Ville"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Ville</Label>
                  <Input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    placeholder="Conakry"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pays</Label>
                  <Input
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                    placeholder="Guinée"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" /> Site web
                </Label>
                <Input
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  placeholder="https://universite.edu.gn"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Description & Devise
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Slogan / Tagline</Label>
                <Input
                  value={settings.tagline}
                  onChange={(e) => setSettings({ ...settings, tagline: e.target.value })}
                  placeholder="L'excellence au service de l'éducation"
                />
              </div>
              <div className="space-y-2">
                <Label>Devise / Motto</Label>
                <Input
                  value={settings.school_motto}
                  onChange={(e) => setSettings({ ...settings, school_motto: e.target.value })}
                  placeholder="Savoir, Innovation, Excellence"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={settings.description}
                  onChange={(e) => setSettings({ ...settings, description: e.target.value })}
                  placeholder="Brève description de l'établissement..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB: Apparence ═════════════════════════════════════════════════ */}
        <TabsContent value="branding" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="w-5 h-5" />
                Logo & Favicon
              </CardTitle>
              <CardDescription>Images de marque de l'établissement</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label>URL du logo</Label>
                  <Input
                    value={settings.logo_url}
                    onChange={(e) => setSettings({ ...settings, logo_url: e.target.value })}
                    placeholder="https://... ou /uploads/logos/..."
                  />
                  {settings.logo_url && (
                    <div className="w-24 h-24 rounded-xl border bg-muted/30 flex items-center justify-center overflow-hidden">
                      <img
                        src={settings.logo_url}
                        alt="Logo"
                        className="w-full h-full object-contain p-2"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <Label>URL du favicon</Label>
                  <Input
                    value={settings.favicon_url}
                    onChange={(e) => setSettings({ ...settings, favicon_url: e.target.value })}
                    placeholder="https://... ou /uploads/favicons/..."
                  />
                  {settings.favicon_url && (
                    <div className="w-12 h-12 rounded border bg-muted/30 flex items-center justify-center overflow-hidden">
                      <img
                        src={settings.favicon_url}
                        alt="Favicon"
                        className="w-full h-full object-contain p-1"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5" />
                Palette de couleurs
              </CardTitle>
              <CardDescription>Couleurs utilisées sur la page de connexion et les interfaces de l'établissement</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label>Couleur principale</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={settings.primary_color}
                      onChange={(e) => setSettings({ ...settings, primary_color: e.target.value })}
                      className="w-12 h-10 rounded border cursor-pointer"
                    />
                    <Input
                      value={settings.primary_color}
                      onChange={(e) => setSettings({ ...settings, primary_color: e.target.value })}
                      placeholder="#1e3a5f"
                      className="font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <Label>Couleur secondaire</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={settings.secondary_color}
                      onChange={(e) => setSettings({ ...settings, secondary_color: e.target.value })}
                      className="w-12 h-10 rounded border cursor-pointer"
                    />
                    <Input
                      value={settings.secondary_color}
                      onChange={(e) => setSettings({ ...settings, secondary_color: e.target.value })}
                      placeholder="#64748b"
                      className="font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Aperçu</Label>
                <div
                  className="rounded-xl p-6 text-white flex items-center gap-4"
                  style={{
                    background: `linear-gradient(135deg, ${settings.primary_color}, ${settings.secondary_color})`,
                  }}
                >
                  <div className="w-14 h-14 rounded-lg bg-white/20 flex items-center justify-center">
                    <BookOpen className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">{form.name || "Nom de l'établissement"}</h3>
                    <p className="text-sm text-white/75">{settings.tagline || "Slogan de l'établissement"}</p>
                  </div>
                </div>
              </div>

              {/* Presets */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Thèmes prédéfinis</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => setSettings({
                        ...settings,
                        primary_color: preset.primary,
                        secondary_color: preset.secondary,
                      })}
                      className="flex items-center gap-2 p-2.5 rounded-lg border hover:border-primary/50 hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="flex gap-1 shrink-0">
                        <div className="w-5 h-5 rounded-full border" style={{ backgroundColor: preset.primary }} />
                        <div className="w-5 h-5 rounded-full border" style={{ backgroundColor: preset.secondary }} />
                      </div>
                      <span className="text-xs truncate">{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB: Localisation ══════════════════════════════════════════════ */}
        <TabsContent value="locale" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Devise & Langue
              </CardTitle>
              <CardDescription>Paramètres régionaux de l'établissement</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Devise monétaire</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Fuseau horaire</Label>
                  <Select value={form.timezone} onValueChange={(v) => setForm({ ...form, timezone: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Langue par défaut</Label>
                <Select value={settings.language} onValueChange={(v) => setSettings({ ...settings, language: v })}>
                  <SelectTrigger className="w-full md:w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB: Académique ════════════════════════════════════════════════ */}
        <TabsContent value="academic" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Configuration académique
              </CardTitle>
              <CardDescription>Système de notation et organisation pédagogique</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Système académique</Label>
                  <Select
                    value={settings.academic_system}
                    onValueChange={(v) => setSettings({ ...settings, academic_system: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="semester">Semestriel</SelectItem>
                      <SelectItem value="trimester">Trimestriel</SelectItem>
                      <SelectItem value="quarter">Quadrimestriel</SelectItem>
                      <SelectItem value="annual">Annuel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Échelle de notation</Label>
                  <Select
                    value={settings.grading_scale}
                    onValueChange={(v) => setSettings({ ...settings, grading_scale: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="20">Sur 20 (système français)</SelectItem>
                      <SelectItem value="100">Sur 100 (pourcentage)</SelectItem>
                      <SelectItem value="10">Sur 10</SelectItem>
                      <SelectItem value="letter">Lettres (A-F)</SelectItem>
                      <SelectItem value="gpa">GPA (4.0)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Floating save button */}
      <div className="sticky bottom-4 flex justify-end">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          size="lg"
          className="shadow-lg gap-2"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer les modifications
        </Button>
      </div>
    </div>
  );
}
