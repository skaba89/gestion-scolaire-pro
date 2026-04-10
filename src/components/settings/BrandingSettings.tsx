import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useSettings } from "@/hooks/useSettings";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Save, RotateCcw, Loader2 } from "lucide-react";

import { BrandingFormData } from "./branding/BrandingTypes";
import { LogoSection } from "./branding/LogoSection";
import { ColorSection } from "./branding/ColorSection";
import { TypographySection } from "./branding/TypographySection";
import { AdvancedColorsSection } from "./branding/AdvancedColorsSection";
import { TerminologySection } from "./branding/TerminologySection";
import { LayoutSection } from "./branding/LayoutSection";
import { PreviewSection } from "./branding/PreviewSection";

export function BrandingSettings() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const { settings, updateSettings, isUpdating } = useSettings();

  const [formData, setFormData] = useState<BrandingFormData>({
    name: "",
    official_name: "",
    logo_url: "",
    primary_color: "#3b82f6",
    secondary_color: "#64748b",
    accent_color: "#f59e0b",
    show_logo_text: true,
    favicon_url: "",
    sidebar_position: "left",
    sidebar_layout: "standard",
    font_family: "Inter",
    menu_active_color: "#3b82f6",
    menu_bg_color: "#ffffff",
    tab_active_color: "#3b82f6",
    student_label_mode: "automatic",
  });

  // Load settings on mount
  useEffect(() => {
    if (settings) {
      setFormData({
        name: settings.name || tenant?.name || "",
        official_name: settings.official_name || "",
        logo_url: settings.logo_url || tenant?.logo_url || "",
        primary_color: settings.primary_color || "#3b82f6",
        secondary_color: settings.secondary_color || "#64748b",
        accent_color: settings.accent_color || "#f59e0b",
        show_logo_text: settings.show_logo_text !== false,
        favicon_url: settings.favicon_url || "",
        sidebar_position: settings.sidebar_position || "left",
        sidebar_layout: settings.sidebar_layout || "standard",
        font_family: settings.font_family || "Inter",
        menu_active_color: settings.menu_active_color || settings.primary_color || "#3b82f6",
        menu_bg_color: settings.menu_bg_color || "#ffffff",
        tab_active_color: settings.tab_active_color || settings.primary_color || "#3b82f6",
        student_label_mode: settings.student_label_mode || "automatic",
      });
    }
  }, [settings, tenant]);

  const handleUpdateFormData = (updates: Partial<BrandingFormData> | ((prev: BrandingFormData) => BrandingFormData)) => {
    if (typeof updates === 'function') {
      setFormData(updates);
    } else {
      setFormData(prev => ({ ...prev, ...updates }));
    }
  };

  const handleSave = async () => {
    try {
      const success = await updateSettings(formData);

      if (success && formData.name !== tenant?.name) {
        await apiClient.patch(`/tenants/${tenant?.id}/`, { name: formData.name });
      }
    } catch (error: any) {
      toast({ title: "Erreur", description: error.response?.data?.detail || error.message, variant: "destructive" });
    }
  };

  const handleReset = () => {
    if (settings) {
      setFormData({
        name: settings.name || tenant?.name || "",
        official_name: settings.official_name || "",
        logo_url: settings.logo_url || tenant?.logo_url || "",
        primary_color: settings.primary_color || "#3b82f6",
        secondary_color: settings.secondary_color || "#64748b",
        accent_color: settings.accent_color || "#f59e0b",
        show_logo_text: settings.show_logo_text ?? true,
        favicon_url: settings.favicon_url || "",
        sidebar_position: settings.sidebar_position || "left",
        sidebar_layout: settings.sidebar_layout || "standard",
        font_family: settings.font_family || "Inter",
        menu_active_color: settings.menu_active_color || settings.primary_color || "#3b82f6",
        menu_bg_color: settings.menu_bg_color || "#ffffff",
        tab_active_color: settings.tab_active_color || settings.primary_color || "#3b82f6",
        student_label_mode: settings.student_label_mode || "automatic",
      });
    }
  };

  return (
    <div className="space-y-6">
      <LogoSection formData={formData} setFormData={handleUpdateFormData} />
      <ColorSection formData={formData} setFormData={handleUpdateFormData} />
      <TypographySection formData={formData} setFormData={handleUpdateFormData} />
      <AdvancedColorsSection formData={formData} setFormData={handleUpdateFormData} />
      <TerminologySection formData={formData} setFormData={handleUpdateFormData} />
      <LayoutSection formData={formData} setFormData={handleUpdateFormData} />
      <PreviewSection formData={formData} setFormData={handleUpdateFormData} />

      <div className="flex gap-3 justify-end sticky bottom-6 bg-background/80 backdrop-blur-sm p-4 rounded-xl border shadow-lg z-10 font-bold decoration-amber-500">
        <Button variant="outline" onClick={handleReset} disabled={isUpdating}>
          <RotateCcw className="w-4 h-4 mr-2" />
          Réinitialiser
        </Button>
        <Button onClick={handleSave} disabled={isUpdating}>
          {isUpdating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Enregistrement...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Enregistrer les modifications
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
