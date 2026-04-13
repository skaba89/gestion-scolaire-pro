import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { X, Cookie, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export type CookiePreferences = {
    essential: boolean; // Always true
    analytics: boolean;
    marketing: boolean;
    minimized?: boolean;
};

const COOKIE_PREF_KEY = "schoolflow_cookie_preferences";

export const CookieConsentBanner = () => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [preferences, setPreferences] = useState<CookiePreferences>({
        essential: true,
        analytics: false,
        marketing: false,
    });

    useEffect(() => {
        const savedPrefs = localStorage.getItem(COOKIE_PREF_KEY);
        if (!savedPrefs) {
            // First visit or cleared data
            setIsOpen(true);
        } else {
            // Check if we need to re-ask (e.g. new policy version) - for now just hide
            const parsed = JSON.parse(savedPrefs);
            setPreferences(parsed);
            // Optional: Add logic to show a small badge to change settings later
        }
    }, []);

    const handleAcceptAll = () => {
        const newPrefs = { essential: true, analytics: true, marketing: true };
        savePreferences(newPrefs);
    };

    const handleDeclineAll = () => {
        const newPrefs = { essential: true, analytics: false, marketing: false };
        savePreferences(newPrefs);
    };

    const handleSavePreferences = () => {
        savePreferences(preferences);
    };

    const savePreferences = (prefs: CookiePreferences) => {
        localStorage.setItem(COOKIE_PREF_KEY, JSON.stringify(prefs));
        setPreferences(prefs);
        setIsOpen(false);

        // Here we would actually initialize or disable trackers based on prefs
        if (prefs.analytics) {
            // window.gtag('consent', 'update', { ... })
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-[450px]"
            >
                <Card className="p-5 shadow-2xl border-primary/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                    {!showDetails ? (
                        <div className="space-y-4">
                            <div className="flex items-start gap-4">
                                <div className="p-2 bg-primary/10 rounded-full">
                                    <Cookie className="h-6 w-6 text-primary" />
                                </div>
                                <div className="space-y-2 flex-1">
                                    <h3 className="font-semibold text-lg flex items-center justify-between">
                                        {t("privacy.cookiesTitle", "Nous respectons votre vie privée")}
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        {t(
                                            "privacy.cookiesDescription",
                                            "Nous utilisons des cookies pour améliorer votre expérience, analyser le trafic et sécuriser notre plateforme. Les cookies essentiels sont nécessaires au fonctionnement du site."
                                        )}
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2 pt-2">
                                <div className="flex gap-2">
                                    <Button onClick={handleAcceptAll} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
                                        {t("common.acceptAll", "Tout accepter")}
                                    </Button>
                                    <Button onClick={handleDeclineAll} variant="outline" className="flex-1">
                                        {t("common.decline", "Refuser")}
                                    </Button>
                                </div>
                                <Button
                                    onClick={() => setShowDetails(true)}
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs text-muted-foreground underline"
                                >
                                    {t("privacy.personalize", "Personnaliser mes choix")}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b pb-3">
                                <h3 className="font-semibold flex items-center gap-2">
                                    <ShieldCheck className="h-4 w-4 text-primary" />
                                    {t("privacy.preferences", "Préférences de confidentialité")}
                                </h3>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => setShowDetails(false)}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>

                            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                                <div className="flex items-center justify-between space-x-2">
                                    <div className="space-y-0.5">
                                        <Label className="text-base font-medium">Essentiels (Requis)</Label>
                                        <p className="text-xs text-muted-foreground">
                                            Nécessaires pour le fonctionnement (authentification, sécurité, session).
                                        </p>
                                    </div>
                                    <Switch checked={true} disabled />
                                </div>

                                <div className="flex items-center justify-between space-x-2">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="analytics" className="text-base font-medium">Analytiques</Label>
                                        <p className="text-xs text-muted-foreground">
                                            Nous aident à comprendre comment vous utilisez le site pour l'améliorer.
                                        </p>
                                    </div>
                                    <Switch
                                        id="analytics"
                                        checked={preferences.analytics}
                                        onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, analytics: checked }))}
                                    />
                                </div>

                                <div className="flex items-center justify-between space-x-2">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="marketing" className="text-base font-medium">Marketing</Label>
                                        <p className="text-xs text-muted-foreground">
                                            Utilisés pour vous proposer des contenus pertinents (rarement utilisé).
                                        </p>
                                    </div>
                                    <Switch
                                        id="marketing"
                                        checked={preferences.marketing}
                                        onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, marketing: checked }))}
                                    />
                                </div>
                            </div>

                            <div className="flex gap-2 pt-2 border-t mt-2">
                                <Button onClick={handleSavePreferences} className="w-full">
                                    {t("common.savePreferences", "Enregistrer mes choix")}
                                </Button>
                            </div>

                            <div className="text-center">
                                <Link to="/legal" className="text-xs text-muted-foreground hover:underline">
                                    Voir notre politique de confidentialité
                                </Link>
                            </div>
                        </div>
                    )}
                </Card>
            </motion.div>
        </AnimatePresence>
    );
};
