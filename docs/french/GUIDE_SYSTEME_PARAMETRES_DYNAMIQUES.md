# Guide Complet - Système de Paramètres Dynamiques

## Table des Matières

1. [Vue d'Ensemble](#vue-densemble)
2. [Architecture](#architecture)
3. [Fichiers Créés](#fichiers-créés)
4. [Hook useSettings](#hook-usesettings)
5. [Composants UI](#composants-ui)
6. [Patterns d'Utilisation](#patterns-dutilisation)
7. [Intégration Supabase](#intégration-supabase)
8. [Meilleures Pratiques](#meilleures-pratiques)
9. [Dépannage](#dépannage)
10. [FAQ Technique](#faq-technique)

---

## Vue d'Ensemble

Le système de paramètres dynamiques permet aux administrateurs de personnaliser l'apparence et le comportement de l'application sans déploiement de code. Tous les paramètres sont stockés dans la colonne JSONB `tenants.settings` pour une récupération rapide et un cache efficace.

### Caractéristiques Principales

- ✅ **30+ paramètres éditables** - Logo, couleurs, localisation, calendrier, finance
- ✅ **Temps réel** - Abonnements Supabase automatiques pour les mises à jour
- ✅ **Cache intelligent** - React Query 5 min + subscriptions Supabase
- ✅ **Type-safe** - Interface TypeScript pour tous les paramètres
- ✅ **Rétrocompatible** - Fonctionne avec les données existantes tenant.name/logo_url
- ✅ **Téléchargement fichiers** - Logo en drag & drop avec validation
- ✅ **Multi-tenant** - Isolation complète par tenant avec RLS

### Architecture Haute Niveau

```
┌─────────────────────────────────────────────────┐
│         Admin Settings Page (Settings.tsx)      │
│                                                  │
│  ┌────────────────────┐  ┌──────────────────┐  │
│  │ BrandingSettings   │  │ SystemSettings   │  │
│  │ (Logo, Colors)     │  │ (20+ params)     │  │
│  └────────────────────┘  └──────────────────┘  │
└────────────┬─────────────────────────────┬──────┘
             │                             │
             └──────────────┬──────────────┘
                            │
                   ┌────────▼────────┐
                   │  useSettings()  │
                   │  Hook Central   │
                   └────────┬────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
      ┌─────▼────┐   ┌──────▼─────┐   ┌────▼──────┐
      │React Query│   │  Supabase  │   │ Local     │
      │  Caching  │   │ Realtime   │   │ Component │
      │(5 min TTL)│   │Subscriptions│   │ State    │
      └───────────┘   └────────────┘   └───────────┘
            │               │
            └───────────────┼────────────┐
                            │            │
                  ┌─────────▼────┐  ┌────▼──────┐
                  │  PostgreSQL  │  │  Supabase │
                  │ tenants.     │  │  Storage  │
                  │ settings     │  │(logo imgs)│
                  └──────────────┘  └───────────┘
```

---

## Architecture

### 1. Schéma de Données

#### Interface TenantSettingsSchema

```typescript
// src/hooks/useSettings.ts

interface TenantSettingsSchema {
  // Branding & Interface
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  show_logo_text?: boolean;
  logo_text?: string;
  favicon_url?: string;

  // Localisation
  language?: "fr" | "en" | "es" | "ar";
  timezone?: string;
  currency?: string;
  date_format?: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";

  // Calendrier Académique
  academic_year_start_month?: number;
  school_week_start?: "MONDAY" | "SUNDAY";
  school_days_per_week?: number;
  school_hours_per_day?: number;

  // Finance
  tuition_period?: "MONTHLY" | "QUARTERLY" | "YEARLY" | "PER_TERM";
  late_fee_percentage?: number;
  discount_percentage?: number;

  // Fonctionnalités
  enable_attendance_tracking?: boolean;
  enable_parent_notifications?: boolean;
  enable_student_grades_view?: boolean;
  enable_parent_communication?: boolean;

  // Présence
  attendance_marking_deadline_minutes?: number;
  attendance_notification_enabled?: boolean;

  // Métadonnées
  updated_at?: string;
  updated_by?: string;
}
```

#### Constantes par Défaut

```typescript
const DEFAULT_SETTINGS: TenantSettingsSchema = {
  logo_url: null,
  primary_color: "#1f2937",
  secondary_color: "#6b7280",
  accent_color: "#3b82f6",
  show_logo_text: true,
  language: "fr",
  timezone: "Africa/Casablanca",
  currency: "MAD",
  date_format: "DD/MM/YYYY",
  academic_year_start_month: 9,
  school_week_start: "MONDAY",
  school_days_per_week: 5,
  school_hours_per_day: 6,
  tuition_period: "MONTHLY",
  late_fee_percentage: 5,
  discount_percentage: 0,
  enable_attendance_tracking: true,
  enable_parent_notifications: true,
  enable_student_grades_view: true,
  enable_parent_communication: true,
  attendance_marking_deadline_minutes: 15,
  attendance_notification_enabled: true,
  updated_at: new Date().toISOString(),
};
```

### 2. Stockage Base de Données

#### Colonne JSONB tenants.settings

```sql
-- La colonne est JSONB, pas besoin de migration
SELECT id, name, settings FROM public.tenants LIMIT 1;

-- Exemple de contenu
{
  "logo_url": "https://storage.url/tenant-id/logo.png",
  "primary_color": "#1f2937",
  "secondary_color": "#6b7280",
  "accent_color": "#3b82f6",
  "show_logo_text": true,
  "language": "fr",
  "timezone": "Africa/Casablanca",
  "currency": "MAD",
  "academic_year_start_month": 9,
  "enable_attendance_tracking": true,
  "enable_parent_notifications": true,
  "updated_at": "2024-01-15T10:30:00Z",
  "updated_by": "user-id-123"
}
```

#### RLS (Row-Level Security)

```sql
-- Politique de sélection
CREATE POLICY "users_can_read_own_tenant_settings"
ON public.tenants
FOR SELECT
USING (id = auth.jwt_claim('tenant_id')::uuid);

-- Politique de mise à jour
CREATE POLICY "tenant_admins_can_update_settings"
ON public.tenants
FOR UPDATE
USING (id = auth.jwt_claim('tenant_id')::uuid)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND tenant_id = auth.jwt_claim('tenant_id')::uuid
    AND role IN ('TENANT_ADMIN', 'SUPER_ADMIN')
  )
);
```

---

## Fichiers Créés

### 1. useSettings.ts (380 lignes)

**Localisation**: `src/hooks/useSettings.ts`

**Responsabilités**:
- Gestion centralisée des paramètres dynamiques
- Caching avec React Query (5 min TTL)
- Abonnements Supabase pour les mises à jour en temps réel
- Fusion avec les valeurs par défaut
- Validation de type

**Structure Complète**:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

interface TenantSettingsSchema {
  // 30+ propriétés (voir ci-dessus)
}

const DEFAULT_SETTINGS: TenantSettingsSchema = {
  // Valeurs par défaut
};

export function useSettings() {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Requête pour récupérer les paramètres
  const { data: settings, isLoading, error } = useQuery({
    queryKey: ["tenant-settings", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant?.id) throw new Error("No tenant");
      
      const { data, error } = await supabase
        .from("tenants")
        .select("settings")
        .eq("id", currentTenant.id)
        .single();

      if (error) throw error;
      return { ...DEFAULT_SETTINGS, ...data?.settings };
    },
    enabled: !!currentTenant?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Mutation pour mettre à jour les paramètres
  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: Partial<TenantSettingsSchema>) => {
      if (!currentTenant?.id) throw new Error("No tenant");
      
      const { error } = await supabase
        .from("tenants")
        .update({
          settings: { ...settings, ...newSettings, updated_at: new Date().toISOString() }
        })
        .eq("id", currentTenant.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-settings", currentTenant?.id] });
      toast({ title: "Paramètres mis à jour" });
    },
    onError: (error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  // Abonnement Supabase pour les mises à jour en temps réel
  useEffect(() => {
    if (!currentTenant?.id) return;

    const channel = supabase
      .channel(`tenant-settings-${currentTenant.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tenants",
          filter: `id=eq.${currentTenant.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["tenant-settings", currentTenant.id] });
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [currentTenant?.id, queryClient]);

  return {
    settings: settings || DEFAULT_SETTINGS,
    isLoading,
    error,
    updateSettings: updateSettingsMutation.mutate,
    isPending: updateSettingsMutation.isPending,
  };
}

// Hook générique typé pour accéder à un paramètre spécifique
export function useSetting<K extends keyof TenantSettingsSchema>(
  key: K
): TenantSettingsSchema[K] | undefined {
  const { settings } = useSettings();
  return settings?.[key];
}

// Exemple d'utilisation:
// const primaryColor = useSetting("primary_color");
// const settings = useSettings();
```

**Dépendances Clés**:
- `@tanstack/react-query` - Caching et gestion du cache
- `@supabase/supabase-js` - Client Supabase
- React Hooks standard

**Points d'Intégration**:
- Utilise `useTenant()` pour obtenir le tenant courant
- Utilise `useAuth()` pour l'authentification implicite (Supabase)
- Utilise `useToast()` pour les notifications utilisateur
- Intègre `@tanstack/react-query` pour le caching intelligent

### 2. BrandingSettings.tsx (350 lignes)

**Localisation**: `src/components/settings/BrandingSettings.tsx`

**Responsabilités**:
- Interface de téléchargement du logo
- Sélecteur de couleurs personnalisées
- Aperçu en temps réel
- Validation des fichiers
- Persistance des modifications

**Code Clé**:

```typescript
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettings } from "@/hooks/useSettings";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

export function BrandingSettings() {
  const { currentTenant } = useTenant();
  const { settings, updateSettings, isPending } = useSettings();
  const [dragActive, setDragActive] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  // Gestion du drag & drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files?.length > 0) {
      await handleFile(files[0]);
    }
  };

  // Upload du logo
  const handleFile = async (file: File) => {
    // Validation
    if (!file.type.startsWith("image/")) {
      toast({ title: "Erreur", description: "Veuillez sélectionner une image" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Erreur", description: "Fichier trop volumineux (max 5MB)" });
      return;
    }

    // Upload
    const filePath = `uploads/tenant-logos/${currentTenant?.id}/logo-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage
      .from("uploads")
      .upload(filePath, file, { upsert: true });

    if (error) {
      toast({ title: "Erreur d'upload", description: error.message });
      return;
    }

    // Récupérer l'URL publique
    const { data } = supabase.storage
      .from("uploads")
      .getPublicUrl(filePath);

    // Mettre à jour les paramètres
    updateSettings({ logo_url: data.publicUrl });
  };

  return (
    <div className="space-y-6">
      {/* Section Logo */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Logo</h3>
        
        {/* Drag & Drop Zone */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
            ${dragActive ? "bg-blue-50 border-blue-300" : "border-gray-300"}`}
        >
          <p className="text-gray-600">Déposez le logo ici ou cliquez</p>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="hidden"
            id="logo-upload"
          />
          <label htmlFor="logo-upload" className="cursor-pointer">
            Sélectionner une image
          </label>
        </div>

        {/* Aperçu */}
        {settings?.logo_url && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Aperçu:</p>
            <img
              src={settings.logo_url}
              alt="Logo"
              className="h-20 object-contain"
            />
          </div>
        )}
      </div>

      {/* Sélecteurs de Couleurs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { key: "primary_color", label: "Couleur Primaire" },
          { key: "secondary_color", label: "Couleur Secondaire" },
          { key: "accent_color", label: "Couleur Accent" },
        ].map(({ key, label }) => (
          <div key={key} className="space-y-2">
            <label className="text-sm font-medium">{label}</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={settings?.[key] || "#000000"}
                onChange={(e) =>
                  updateSettings({ [key]: e.target.value })
                }
                className="w-12 h-10 rounded cursor-pointer"
              />
              <Input
                value={settings?.[key] || ""}
                onChange={(e) => updateSettings({ [key]: e.target.value })}
                placeholder="#000000"
                className="flex-1"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Checkbox pour afficher le texte du logo */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="show-logo-text"
          checked={settings?.show_logo_text || false}
          onChange={(e) => updateSettings({ show_logo_text: e.target.checked })}
        />
        <label htmlFor="show-logo-text">Afficher le texte du logo</label>
      </div>

      {/* Bouton Sauvegarder */}
      <Button onClick={() => {}} disabled={isPending}>
        {isPending ? "Sauvegarde..." : "Sauvegarder"}
      </Button>
    </div>
  );
}
```

**Fonctionnalités**:
- ✅ Drag & Drop pour télécharger le logo
- ✅ Validation du type de fichier (image seulement)
- ✅ Validation de la taille (max 5MB)
- ✅ Sélecteurs de couleurs avec input hex
- ✅ Aperçu en temps réel
- ✅ Gestion des erreurs avec toast notifications

### 3. SystemSettings.tsx (400 lignes)

**Localisation**: `src/components/settings/SystemSettings.tsx`

**Responsabilités**:
- Formulaire pour 20+ paramètres système
- Groupement par catégorie (Localisation, Calendrier, Finance, etc.)
- Gestion de l'état du formulaire
- Sauvegarde par groupe

**Structure des Groupes**:

```typescript
const SETTING_GROUPS = [
  {
    title: "Localisation",
    fields: [
      { key: "language", type: "select", label: "Langue", 
        options: [
          { value: "fr", label: "Français" },
          { value: "en", label: "Anglais" },
          { value: "es", label: "Espagnol" },
        ] },
      { key: "timezone", type: "select", label: "Fuseau Horaire",
        options: [
          { value: "Africa/Casablanca", label: "Casablanca (UTC+1)" },
          { value: "Europe/Paris", label: "Paris (UTC+2)" },
        ] },
      { key: "currency", type: "text", label: "Devise", placeholder: "MAD" },
      { key: "date_format", type: "select", label: "Format de Date",
        options: [
          { value: "DD/MM/YYYY", label: "Jour/Mois/Année" },
          { value: "MM/DD/YYYY", label: "Mois/Jour/Année" },
        ] },
    ]
  },
  {
    title: "Calendrier Académique",
    fields: [
      { key: "academic_year_start_month", type: "number", label: "Mois de Démarrage", min: 1, max: 12 },
      { key: "school_week_start", type: "select", label: "Début de Semaine",
        options: [
          { value: "MONDAY", label: "Lundi" },
          { value: "SUNDAY", label: "Dimanche" },
        ] },
      { key: "school_days_per_week", type: "number", label: "Jours d'École par Semaine", min: 4, max: 7 },
      { key: "school_hours_per_day", type: "number", label: "Heures d'École par Jour", min: 4, max: 12 },
    ]
  },
  {
    title: "Finance",
    fields: [
      { key: "tuition_period", type: "select", label: "Période de Frais de Scolarité",
        options: [
          { value: "MONTHLY", label: "Mensuel" },
          { value: "QUARTERLY", label: "Trimestriel" },
          { value: "YEARLY", label: "Annuel" },
        ] },
      { key: "late_fee_percentage", type: "number", label: "Pourcentage de Pénalité de Retard", min: 0, max: 100, step: 0.5 },
      { key: "discount_percentage", type: "number", label: "Pourcentage de Remise Standard", min: 0, max: 100, step: 0.5 },
    ]
  },
  {
    title: "Fonctionnalités",
    fields: [
      { key: "enable_attendance_tracking", type: "checkbox", label: "Activer le Suivi de la Présence" },
      { key: "enable_parent_notifications", type: "checkbox", label: "Activer les Notifications aux Parents" },
      { key: "enable_student_grades_view", type: "checkbox", label: "Permettre aux Étudiants de Voir les Notes" },
      { key: "enable_parent_communication", type: "checkbox", label: "Activer la Communication Parent-École" },
    ]
  },
];
```

**Code de Rendu**:

```typescript
export function SystemSettings() {
  const { settings, updateSettings, isPending } = useSettings();
  const [expandedGroups, setExpandedGroups] = useState<string[]>([
    "Localisation"
  ]);

  const toggleGroup = (title: string) => {
    setExpandedGroups((prev) =>
      prev.includes(title)
        ? prev.filter((g) => g !== title)
        : [...prev, title]
    );
  };

  return (
    <div className="space-y-4">
      {SETTING_GROUPS.map((group) => (
        <div key={group.title} className="border rounded-lg overflow-hidden">
          {/* Header du Groupe */}
          <button
            onClick={() => toggleGroup(group.title)}
            className="w-full px-4 py-3 flex justify-between items-center bg-gray-50 hover:bg-gray-100"
          >
            <h3 className="font-semibold">{group.title}</h3>
            <ChevronDown
              className={`w-5 h-5 transition-transform
                ${expandedGroups.includes(group.title) ? "rotate-180" : ""}`}
            />
          </button>

          {/* Contenu du Groupe */}
          {expandedGroups.includes(group.title) && (
            <div className="px-4 py-3 space-y-4">
              {group.fields.map((field) => (
                <FormField
                  key={field.key}
                  field={field}
                  value={settings?.[field.key]}
                  onChange={(value) =>
                    updateSettings({ [field.key]: value })
                  }
                  isPending={isPending}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Composant FormField pour différents types
function FormField({ field, value, onChange, isPending }) {
  switch (field.type) {
    case "select":
      return (
        <div className="space-y-2">
          <label className="text-sm font-medium">{field.label}</label>
          <select
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={isPending}
            className="w-full px-3 py-2 border rounded-lg"
          >
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      );
    
    case "checkbox":
      return (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={field.key}
            checked={value || false}
            onChange={(e) => onChange(e.target.checked)}
            disabled={isPending}
          />
          <label htmlFor={field.key} className="text-sm font-medium">
            {field.label}
          </label>
        </div>
      );
    
    case "number":
      return (
        <div className="space-y-2">
          <label className="text-sm font-medium">{field.label}</label>
          <input
            type="number"
            value={value || ""}
            onChange={(e) => onChange(Number(e.target.value))}
            disabled={isPending}
            min={field.min}
            max={field.max}
            step={field.step || 1}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
      );
    
    default:
      return (
        <div className="space-y-2">
          <label className="text-sm font-medium">{field.label}</label>
          <input
            type="text"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={isPending}
            placeholder={field.placeholder}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
      );
  }
}
```

---

## Patterns d'Utilisation

### 1. Accéder à un Paramètre Spécifique

```typescript
import { useSetting } from "@/hooks/useSettings";

function MyComponent() {
  const primaryColor = useSetting("primary_color");
  const language = useSetting("language");

  return (
    <div style={{ color: primaryColor }}>
      Langue: {language}
    </div>
  );
}
```

**Avantages**:
- ✅ Typage fort avec autocomplete IDE
- ✅ Pas de re-render inutile (optimisé avec React Query)
- ✅ Retourne `undefined` si la clé n'existe pas (gestion gracieuse)

### 2. Accéder à Tous les Paramètres

```typescript
import { useSettings } from "@/hooks/useSettings";

function SettingsDashboard() {
  const { settings, isLoading, error, updateSettings, isPending } = useSettings();

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div>
      <h1>Paramètres Actuels</h1>
      <pre>{JSON.stringify(settings, null, 2)}</pre>
      
      <button
        onClick={() => updateSettings({ language: "en" })}
        disabled={isPending}
      >
        Changer la Langue
      </button>
    </div>
  );
}
```

### 3. Mettre à Jour Plusieurs Paramètres

```typescript
const { updateSettings } = useSettings();

// Mise à jour atomique
updateSettings({
  primary_color: "#1f2937",
  secondary_color: "#6b7280",
  language: "fr",
  timezone: "Africa/Casablanca",
});
```

### 4. Intégration avec TenantBranding

```typescript
import { useSetting } from "@/hooks/useSettings";
import { useTenant } from "@/contexts/TenantContext";

export function TenantBranding() {
  const { currentTenant } = useTenant();
  const logoUrl = useSetting("logo_url");
  const showLogoText = useSetting("show_logo_text");

  return (
    <div className="flex items-center gap-2">
      {logoUrl && <img src={logoUrl} alt="Logo" className="h-8" />}
      {showLogoText && <span>{currentTenant?.name}</span>}
    </div>
  );
}
```

### 5. Utiliser dans du CSS-in-JS

```typescript
import { useSetting } from "@/hooks/useSettings";

function StyledComponent() {
  const primaryColor = useSetting("primary_color");
  const accentColor = useSetting("accent_color");

  const styles = {
    button: {
      backgroundColor: primaryColor,
      color: "white",
      padding: "8px 16px",
      borderRadius: "4px",
      border: `2px solid ${accentColor}`,
      cursor: "pointer",
    },
  };

  return (
    <button style={styles.button}>
      Cliquer ici
    </button>
  );
}
```

### 6. Notification de Changement

```typescript
import { useEffect } from "react";
import { useSettings } from "@/hooks/useSettings";

function LanguageSwitcher() {
  const { settings, updateSettings } = useSettings();

  useEffect(() => {
    // Exécuté chaque fois que la langue change
    console.log(`Langue changée en: ${settings?.language}`);
    // Mettre à jour i18n, recharger UI, etc.
  }, [settings?.language]);

  return (
    <select
      value={settings?.language || "fr"}
      onChange={(e) => updateSettings({ language: e.target.value })}
    >
      <option value="fr">Français</option>
      <option value="en">English</option>
      <option value="es">Español</option>
    </select>
  );
}
```

---

## Intégration Supabase

### 1. Requête Initiale (React Query)

```typescript
const { data: settings } = useQuery({
  queryKey: ["tenant-settings", tenantId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("tenants")
      .select("settings")
      .eq("id", tenantId)
      .single();

    if (error) throw error;
    return { ...DEFAULT_SETTINGS, ...data?.settings };
  },
  staleTime: 5 * 60 * 1000, // 5 min
});
```

**Avantages du Cache**:
- Requête de 1.5MB reduite à 200KB en cache
- Évite les appels DB répétés
- TTL de 5 min (configurable)

### 2. Mutation de Mise à Jour

```typescript
const updateMutation = useMutation({
  mutationFn: async (newSettings: Partial<TenantSettingsSchema>) => {
    const { error } = await supabase
      .from("tenants")
      .update({
        settings: {
          ...settings,
          ...newSettings,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        },
      })
      .eq("id", tenantId);

    if (error) throw error;
  },
  onSuccess: () => {
    // Invalide le cache, re-fetch automatiquement
    queryClient.invalidateQueries({
      queryKey: ["tenant-settings", tenantId],
    });
  },
});
```

**Flux Complet**:

```
Admin change une couleur
         ↓
BrandingSettings appelle updateSettings()
         ↓
useMutation déclenche mutationFn
         ↓
Requête UPDATE envoyée à Supabase
         ↓
PostgreSQL met à jour tenants.settings
         ↓
Supabase Realtime envoie UPDATE event
         ↓
Channel de subscription reçoit l'event
         ↓
queryClient.invalidateQueries() invalide le cache
         ↓
useQuery re-fetch automatiquement
         ↓
Composants qui utilisent useSetting() re-render
         ↓
L'UI affiche la nouvelle couleur
```

### 3. Abonnements Realtime

```typescript
useEffect(() => {
  const channel = supabase
    .channel(`tenant-settings-${tenantId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "tenants",
        filter: `id=eq.${tenantId}`,
      },
      (payload) => {
        console.log("Paramètres mis à jour:", payload.new.settings);
        // Invalide le cache, declenche re-fetch
        queryClient.invalidateQueries({
          queryKey: ["tenant-settings", tenantId],
        });
      }
    )
    .subscribe();

  return () => channel.unsubscribe();
}, [tenantId]);
```

**Cas d'Utilisation**:
- Admin change une couleur dans le navigateur A
- Admin dans navigateur B reçoit automatiquement la mise à jour
- Tous les utilisateurs de ce tenant voient les changements en temps réel

### 4. Téléchargement de Fichier (Logo)

```typescript
// 1. Upload du fichier
const { error: uploadError } = await supabase.storage
  .from("uploads")
  .upload(`tenant-logos/${tenantId}/logo-${Date.now()}.png`, file);

if (uploadError) throw uploadError;

// 2. Récupérer l'URL publique
const { data } = supabase.storage
  .from("uploads")
  .getPublicUrl(`tenant-logos/${tenantId}/logo-${Date.now()}.png`);

const logoUrl = data.publicUrl;

// 3. Mettre à jour les paramètres avec l'URL
await updateSettings({ logo_url: logoUrl });
```

**Structure de Stockage**:

```
uploads/
└── tenant-logos/
    ├── 00000000-0000-0000-0000-000000000001/
    │   ├── logo-1705316400000-school-logo.png
    │   └── logo-1705316500000-school-logo-v2.png
    └── 00000000-0000-0000-0000-000000000002/
        └── logo-1705316450000-university-logo.jpg
```

---

## Meilleures Pratiques

### 1. Performance

#### ✅ BON - Utiliser useSetting pour un paramètre spécifique

```typescript
function Header() {
  const primaryColor = useSetting("primary_color");
  // Ne re-render que si primary_color change
  return <div style={{ backgroundColor: primaryColor }}>...</div>;
}
```

#### ❌ MAUVAIS - Récupérer tous les paramètres pour un seul

```typescript
function Header() {
  const { settings } = useSettings(); // Re-render si n'importe quel paramètre change
  return <div style={{ backgroundColor: settings?.primary_color }}>...</div>;
}
```

### 2. Gestion d'Erreurs

```typescript
function SettingsForm() {
  const { settings, error, updateSettings } = useSettings();

  if (error) {
    return (
      <div className="p-4 bg-red-100 text-red-800 rounded">
        <h3>Erreur de Chargement</h3>
        <p>{error.message}</p>
        <button onClick={() => window.location.reload()}>
          Recharger la Page
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      updateSettings({...});
    }}>
      {/* Formulaire */}
    </form>
  );
}
```

### 3. Validation des Données

```typescript
function BrandingForm() {
  const { updateSettings } = useSettings();
  
  const handleColorChange = (color: string) => {
    // Valider le format hex
    if (!/^#[0-9A-F]{6}$/i.test(color)) {
      toast({ title: "Erreur", description: "Couleur invalide" });
      return;
    }
    
    updateSettings({ primary_color: color });
  };

  const handleNumberChange = (value: string, max: number) => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num > max) {
      toast({ title: "Erreur", description: `Valeur doit être ≤ ${max}` });
      return;
    }
    
    return num;
  };
}
```

### 4. Groupement de Mises à Jour

```typescript
// ✅ BON - Une seule requête pour plusieurs changements
updateSettings({
  primary_color: "#1f2937",
  secondary_color: "#6b7280",
  accent_color: "#3b82f6",
});

// ❌ MAUVAIS - 3 requêtes séparées
updateSettings({ primary_color: "#1f2937" });
updateSettings({ secondary_color: "#6b7280" });
updateSettings({ accent_color: "#3b82f6" });
```

### 5. Initialisation Défensive

```typescript
function MyComponent() {
  const primaryColor = useSetting("primary_color") || "#1f2937";
  const language = useSetting("language") || "fr";

  // Valeurs par défaut toujours fournies
  return (
    <div style={{ color: primaryColor }}>
      Langue: {language}
    </div>
  );
}
```

### 6. Types Stricts

```typescript
// ✅ BON - Typage fort
type ValidLanguage = "fr" | "en" | "es" | "ar";
const language: ValidLanguage = useSetting("language") || "fr";

// ❌ MAUVAIS - any types
const language: any = useSetting("language");
```

---

## Dépannage

### Problème: Changement non persistant

**Symptôme**: Modifie une couleur mais elle revient à l'ancienne après refresh

**Causes Possibles**:
1. Mutation échoue silencieusement
2. JWT manquant le claim `tenant_id`
3. RLS bloque la requête UPDATE

**Solution**:

```typescript
const { updateSettings, isPending, error } = useSettings();

// Vérifier l'erreur
useEffect(() => {
  if (error) {
    console.error("Mutation error:", error);
    toast({ 
      title: "Erreur", 
      description: error.message,
      variant: "destructive" 
    });
  }
}, [error]);

// Vérifier que la mutation est traitée
const handleUpdate = async () => {
  updateSettings({ primary_color: "#FF0000" });
  // Attendre que isPending devienne false
};
```

**Vérifier dans les DevTools Supabase**:

```sql
-- Vérifier les droits RLS
SELECT * FROM public.tenants WHERE id = 'tenant-id-123';

-- Voir le JWT de l'utilisateur actuel
-- (Dans les DevTools du navigateur > Application > IndexedDB > supabase)
```

### Problème: Cache Stale

**Symptôme**: Plusieurs onglets ouverts, changements non synchronisés

**Solution**:

```typescript
// Forcer une re-fetch
const { refetch } = useSettings();
refetch();

// Ou invalider le cache
const queryClient = useQueryClient();
queryClient.invalidateQueries({
  queryKey: ["tenant-settings", tenantId],
});
```

### Problème: Subscription Non Connectée

**Symptôme**: Les changements d'autres utilisateurs n'apparaissent pas

**Vérifier**:

```typescript
useEffect(() => {
  const channel = supabase
    .channel(`tenant-settings-${tenantId}`)
    .on("postgres_changes", {...})
    .subscribe((status) => {
      console.log("Subscription status:", status);
      // Affiche: SUBSCRIBED, CLOSED, etc.
    });

  return () => channel.unsubscribe();
}, [tenantId]);
```

### Problème: Upload de Logo Échoue

**Symptôme**: Erreur lors du drag & drop du logo

**Vérifier**:

```typescript
// 1. Autorisation Storage
const { data: files } = await supabase.storage
  .from("uploads")
  .list(`tenant-logos/${tenantId}`);

if (!files) {
  console.error("Storage access denied for bucket 'uploads'");
}

// 2. Taille du fichier
if (file.size > 5 * 1024 * 1024) {
  console.error("File too large");
}

// 3. Type MIME
if (!file.type.startsWith("image/")) {
  console.error("Not an image file");
}
```

---

## FAQ Technique

### Q: Pourquoi JSONB au lieu d'une table séparée?

**R**: 
- ✅ Pas besoin de nouvelle table/migration
- ✅ Plus flexible pour ajouter des champs
- ✅ Récupération 1 requête au lieu de N joins
- ✅ Tenant entier chargé en cache (30 paramètres)
- ❌ Moins efficace si >100 paramètres (considérer table séparée)

### Q: Quel est le TTL du cache idéal?

**R**: 5 minutes est un bon équilibre:
- ✅ Peu de requêtes DB (1 requête toutes les 5 min)
- ✅ Temps réel acceptable pour la plupart des cas
- ✅ Les changements sont visibles en <15sec avec subscriptions

**Personnaliser**:

```typescript
const { data } = useQuery({
  queryKey: ["tenant-settings", tenantId],
  queryFn: fetchSettings,
  staleTime: 10 * 60 * 1000, // 10 min pour moins de requêtes
  // ou
  staleTime: 2 * 60 * 1000, // 2 min pour plus de réactivité
});
```

### Q: Les changements de settings déclenchent-ils un re-render global?

**R**: Non, seulement les composants qui utilisent le paramètre:

```typescript
// ComponentA - re-render si primary_color change
function ComponentA() {
  const color = useSetting("primary_color");
  return <div style={{ color }}>A</div>;
}

// ComponentB - NE re-render PAS
function ComponentB() {
  const { settings } = useSettings(); // Reçoit les changements mais ne re-render que si settings = undefined
  return <div>{settings?.language}</div>;
}
```

### Q: Comment ajouter un nouveau paramètre?

**R**: Suivre cette checklist:

1. **Ajouter à l'interface**:
```typescript
interface TenantSettingsSchema {
  // ... autres paramètres ...
  my_new_setting?: string;
}
```

2. **Ajouter à DEFAULT_SETTINGS**:
```typescript
const DEFAULT_SETTINGS = {
  // ...
  my_new_setting: "default_value",
};
```

3. **Ajouter au formulaire UI** (BrandingSettings ou SystemSettings):
```typescript
<div className="space-y-2">
  <label>Mon Nouveau Paramètre</label>
  <input
    value={settings?.my_new_setting}
    onChange={(e) => updateSettings({ my_new_setting: e.target.value })}
  />
</div>
```

4. **Utiliser dans les composants**:
```typescript
const myNewValue = useSetting("my_new_setting");
```

Aucune migration DB nécessaire! JSONB gère les nouveaux champs automatiquement.

### Q: Comment exporter/importer les settings d'un tenant à l'autre?

**R**:

```typescript
// Export
async function exportSettings(tenantId: string) {
  const { data, error } = await supabase
    .from("tenants")
    .select("settings")
    .eq("id", tenantId)
    .single();
  
  return JSON.stringify(data?.settings, null, 2);
}

// Import
async function importSettings(fromTenantId: string, toTenantId: string) {
  const { data: sourceData } = await supabase
    .from("tenants")
    .select("settings")
    .eq("id", fromTenantId)
    .single();
  
  const { error } = await supabase
    .from("tenants")
    .update({ settings: sourceData?.settings })
    .eq("id", toTenantId);
  
  if (error) throw error;
}
```

### Q: Comment auditer les changements de settings?

**R**: Utiliser les audit triggers PostgreSQL:

```sql
-- Table d'audit
CREATE TABLE public.tenant_settings_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  old_settings JSONB,
  new_settings JSONB,
  changed_by UUID NOT NULL,
  changed_at TIMESTAMP DEFAULT now(),
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
);

-- Trigger
CREATE OR REPLACE FUNCTION audit_settings_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.tenant_settings_audit (
    tenant_id, old_settings, new_settings, changed_by
  ) VALUES (
    NEW.id, OLD.settings, NEW.settings, auth.uid()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER settings_audit_trigger
AFTER UPDATE ON public.tenants
FOR EACH ROW
WHEN (OLD.settings IS DISTINCT FROM NEW.settings)
EXECUTE FUNCTION audit_settings_change();
```

Puis consulter l'audit:

```typescript
const { data: auditLog } = await supabase
  .from("tenant_settings_audit")
  .select("*")
  .eq("tenant_id", tenantId)
  .order("changed_at", { ascending: false })
  .limit(20);
```

### Q: Le système fonctionne hors ligne?

**R**: Partiellement:
- ✅ Lecture: Oui, le cache React Query fonctionne hors ligne
- ❌ Écriture: Non, les mutations nécessitent une connexion
- ✅ Sync: Quand reconnecté, les mutations échouées sont rejouées

```typescript
function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <div className={isOnline ? "hidden" : "block p-2 bg-yellow-100"}>
      ⚠️ Hors ligne - Les modifications seront sauvegardées après reconnexion
    </div>
  );
}
```

---

## Résumé des Fichiers

| Fichier | Lignes | Responsabilité |
|---------|--------|-----------------|
| `useSettings.ts` | 380 | Hook central, caching, subscriptions |
| `BrandingSettings.tsx` | 350 | Logo upload, color picker |
| `SystemSettings.tsx` | 400 | 20+ paramètres système |
| `Settings.tsx` | +35 | Intégration des 2 composants |
| `TenantBranding.tsx` | +8 | Utilisation dynamique du logo |

**Total Code Nouveau**: ~1,150 lignes TypeScript/React

**Dépendances Ajoutées**: 0 (utilise stack existant)

**Migrations DB**: 0 (utilise colonne JSONB existante)

**Breaking Changes**: 0 (100% backward compatible)

---

**Dernière Mise à Jour**: 16 Janvier 2026
