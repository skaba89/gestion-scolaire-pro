import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Languages, Loader2 } from "lucide-react";
import { useSettingsContext } from "@/components/providers/SettingsProvider";

export const LanguageSwitcher = () => {
    const { t, i18n } = useTranslation();
    const { toast } = useToast();
    const { settings, updateSetting, isUpdating } = useSettingsContext();
    const [currentLanguage, setCurrentLanguage] = useState(settings?.language || i18n.language || 'fr');

    useEffect(() => {
        if (settings?.language) {
            setCurrentLanguage(settings.language);
        }
    }, [settings?.language]);

    const handleLanguageChange = async (newLanguage: string) => {
        try {
            // Update Tenant Settings (Global)
            const success = await updateSetting('language', newLanguage);

            if (success) {
                // i18n.changeLanguage is handled by SettingsProvider, but we can do it optimistically/locally too if needed
                await i18n.changeLanguage(newLanguage);
                setCurrentLanguage(newLanguage);
            }
        } catch (error: any) {
            console.error("Failed to update language:", error);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Languages className="w-5 h-5 text-primary" />
                    {t('settings.language')}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    <Label className="text-sm font-medium">
                        {t('settings.selectLanguage')}
                    </Label>
                    <Select
                        value={currentLanguage}
                        onValueChange={handleLanguageChange}
                        disabled={isUpdating}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder={t('settings.selectLanguage')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="fr">
                                🇫🇷 {t('settings.french')}
                            </SelectItem>
                            <SelectItem value="en">
                                🇬🇧 {t('settings.english')}
                            </SelectItem>
                            <SelectItem value="es">
                                🇪🇸 Espagnol
                            </SelectItem>
                            <SelectItem value="ar">
                                🇸🇦 Arabe
                            </SelectItem>
                            <SelectItem value="zh">
                                🇨🇳 Chinois
                            </SelectItem>
                        </SelectContent>
                    </Select>
                    {isUpdating && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {t('common.loading')}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};
