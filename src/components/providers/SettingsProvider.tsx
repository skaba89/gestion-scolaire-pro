import React, { createContext, useContext, useEffect, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import i18n from "@/i18n/config";
import { apiClient } from "@/api/client";

// Types from existing useSettings
export interface TenantSettingsSchema {
    logo_url?: string;
    primary_color?: string;
    secondary_color?: string;
    accent_color?: string;
    favicon_url?: string;
    name?: string;
    official_name?: string;
    acronym?: string;
    show_logo_text?: boolean;
    show_full_name?: boolean;
    theme_mode?: "light" | "dark" | "auto";
    sidebar_position?: "left" | "right";
    sidebar_layout?: "standard" | "compact";
    sidebar_variant?: "sidebar" | "topbar";
    font_family?: string;
    menu_active_color?: string;
    menu_bg_color?: string;
    tab_active_color?: string;
    student_label_mode?: 'automatic' | 'student' | 'pupil';
    language?: string;
    [key: string]: any;
}

export const DEFAULT_SETTINGS: TenantSettingsSchema = {
    primary_color: "#3b82f6",
    secondary_color: "#64748b",
    accent_color: "#f59e0b",
    name: "École",
    show_logo_text: true,
    theme_mode: "auto",
    sidebar_position: "left",
    sidebar_layout: "standard",
    sidebar_variant: "sidebar",
    font_family: "Inter",
    menu_active_color: "#3b82f6",
    menu_bg_color: "#ffffff",
    tab_active_color: "#3b82f6",
    student_label_mode: "automatic",
    language: "fr",
};

interface SettingsContextType {
    settings: TenantSettingsSchema;
    isLoading: boolean;
    isUpdating: boolean;
    updateSetting: (key: keyof TenantSettingsSchema, value: any) => Promise<boolean>;
    updateSettings: (updates: Partial<TenantSettingsSchema>) => Promise<boolean>;
    resetSettings: () => Promise<boolean>;
    refetch: () => Promise<any>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
    const { tenant } = useTenant();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isUpdating, setIsUpdating] = React.useState(false);

    const { data: cachedSettings, refetch, isLoading } = useQuery({
        queryKey: ["tenant-settings", tenant?.id],
        queryFn: async () => {
            if (!tenant?.id) return DEFAULT_SETTINGS;

            try {
                const response = await apiClient.get("/tenants/settings/");
                return {
                    ...DEFAULT_SETTINGS,
                    ...(response.data || {}),
                };
            } catch (error: any) {
                // Log for debugging but return defaults so the UI doesn't break
                // (super admin without tenant, network issues, etc.)
                console.warn("[SettingsProvider] Failed to fetch tenant settings:",
                    error.response?.status, error.response?.data?.detail || error.message);
                return DEFAULT_SETTINGS;
            }
        },
        enabled: !!tenant?.id,
        staleTime: 5 * 60 * 1000,
        retry: false,
    });

    const settings = useMemo(() => {
        const s = (cachedSettings || DEFAULT_SETTINGS) as TenantSettingsSchema;
        return {
            ...s,
            name: tenant?.name || s?.name || DEFAULT_SETTINGS.name,
            logo_url: tenant?.logo_url || s?.logo_url,
            official_name: s?.official_name || tenant?.name,
        };
    }, [tenant, cachedSettings]);

    // Sync language with i18n
    useEffect(() => {
        if (settings?.language && settings.language !== i18n.language) {
            i18n.changeLanguage(settings.language);
            document.documentElement.lang = settings.language;
        }
    }, [settings?.language]);

    const updateSettings = useCallback(async (updates: Partial<TenantSettingsSchema>) => {
        if (!tenant?.id) return false;
        setIsUpdating(true);
        try {
            await apiClient.patch("/tenants/settings/", updates);
            await refetch();

            if (updates.language && updates.language !== i18n.language) {
                i18n.changeLanguage(updates.language);
            }

            toast({ title: "Paramètres mis à jour", description: "Les modifications ont été enregistrées sur le serveur souverain." });
            return true;
        } catch (error: any) {
            toast({ title: "Erreur", description: error.response?.data?.detail || error.message || "Erreur inconnue", variant: "destructive" });
            return false;
        } finally {
            setIsUpdating(false);
        }
    }, [tenant?.id, refetch, toast]);

    const updateSetting = useCallback(async (key: keyof TenantSettingsSchema, value: any) => {
        return updateSettings({ [key]: value });
    }, [updateSettings]);

    const resetSettings = useCallback(async () => {
        if (!tenant?.id) return false;
        setIsUpdating(true);
        try {
            await apiClient.patch("/tenants/settings/", DEFAULT_SETTINGS);
            await refetch();

            if (DEFAULT_SETTINGS.language !== i18n.language) {
                i18n.changeLanguage(DEFAULT_SETTINGS.language);
            }

            toast({ title: "Paramètres réinitialisés" });
            return true;
        } catch (error: any) {
            toast({ title: "Erreur", description: error.response?.data?.detail || error.message || "Erreur inconnue", variant: "destructive" });
            return false;
        } finally {
            setIsUpdating(false);
        }
    }, [tenant?.id, refetch, toast]);

    const value = useMemo(() => ({
        settings,
        isLoading,
        isUpdating,
        updateSetting,
        updateSettings,
        resetSettings,
        refetch
    }), [settings, isLoading, isUpdating, updateSetting, updateSettings, resetSettings, refetch]);

    return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettingsContext = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error("useSettingsContext must be used within a SettingsProvider");
    }
    return context;
};
