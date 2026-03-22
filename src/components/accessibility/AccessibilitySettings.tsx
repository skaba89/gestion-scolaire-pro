import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { 
  Accessibility, 
  Eye, 
  Type, 
  MousePointer2, 
  Contrast,
  Volume2,
  RotateCcw
} from "lucide-react";

interface AccessibilityPrefs {
  highContrast: boolean;
  largeText: boolean;
  reducedMotion: boolean;
  focusHighlight: boolean;
  fontSize: number;
}

const DEFAULT_PREFS: AccessibilityPrefs = {
  highContrast: false,
  largeText: false,
  reducedMotion: false,
  focusHighlight: true,
  fontSize: 100,
};

export const AccessibilitySettings = () => {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState<AccessibilityPrefs>(() => {
    const stored = localStorage.getItem("accessibility-prefs");
    return stored ? JSON.parse(stored) : DEFAULT_PREFS;
  });

  useEffect(() => {
    localStorage.setItem("accessibility-prefs", JSON.stringify(prefs));
    applyPreferences(prefs);
  }, [prefs]);

  const applyPreferences = (prefs: AccessibilityPrefs) => {
    const root = document.documentElement;

    // High contrast
    if (prefs.highContrast) {
      root.classList.add("high-contrast");
    } else {
      root.classList.remove("high-contrast");
    }

    // Large text
    if (prefs.largeText) {
      root.classList.add("large-text");
    } else {
      root.classList.remove("large-text");
    }

    // Reduced motion
    if (prefs.reducedMotion) {
      root.classList.add("reduce-motion");
    } else {
      root.classList.remove("reduce-motion");
    }

    // Focus highlight
    if (prefs.focusHighlight) {
      root.classList.add("focus-highlight");
    } else {
      root.classList.remove("focus-highlight");
    }

    // Font size
    root.style.setProperty("--accessibility-font-scale", `${prefs.fontSize / 100}`);
  };

  const resetPreferences = () => {
    setPrefs(DEFAULT_PREFS);
  };

  const updatePref = <K extends keyof AccessibilityPrefs>(
    key: K,
    value: AccessibilityPrefs[K]
  ) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Accessibility className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>{t("settings.accessibility.title", "Accessibilité")}</CardTitle>
            <CardDescription>
              {t("settings.accessibility.description", "Personnalisez l'interface pour vos besoins")}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* High Contrast */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Contrast className="w-5 h-5 text-muted-foreground" />
            <div>
              <Label htmlFor="high-contrast" className="font-medium">
                {t("settings.accessibility.highContrast", "Contraste élevé")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.accessibility.highContrastDesc", "Améliore la lisibilité avec des couleurs plus contrastées")}
              </p>
            </div>
          </div>
          <Switch
            id="high-contrast"
            checked={prefs.highContrast}
            onCheckedChange={(checked) => updatePref("highContrast", checked)}
            aria-describedby="high-contrast-desc"
          />
        </div>

        {/* Large Text */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Type className="w-5 h-5 text-muted-foreground" />
            <div>
              <Label htmlFor="large-text" className="font-medium">
                {t("settings.accessibility.largeText", "Texte agrandi")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.accessibility.largeTextDesc", "Augmente la taille du texte de 25%")}
              </p>
            </div>
          </div>
          <Switch
            id="large-text"
            checked={prefs.largeText}
            onCheckedChange={(checked) => updatePref("largeText", checked)}
          />
        </div>

        {/* Font Size Slider */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Eye className="w-5 h-5 text-muted-foreground" />
            <div className="flex-1">
              <Label className="font-medium">
                {t("settings.accessibility.fontSize", "Taille de police")} ({prefs.fontSize}%)
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.accessibility.fontSizeDesc", "Ajustez la taille globale du texte")}
              </p>
            </div>
          </div>
          <Slider
            value={[prefs.fontSize]}
            onValueChange={([value]) => updatePref("fontSize", value)}
            min={75}
            max={150}
            step={5}
            className="w-full"
            aria-label={t("settings.accessibility.fontSize", "Taille de police")}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>75%</span>
            <span>100%</span>
            <span>125%</span>
            <span>150%</span>
          </div>
        </div>

        {/* Reduced Motion */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Volume2 className="w-5 h-5 text-muted-foreground" />
            <div>
              <Label htmlFor="reduced-motion" className="font-medium">
                {t("settings.accessibility.reducedMotion", "Réduire les animations")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.accessibility.reducedMotionDesc", "Désactive les animations et transitions")}
              </p>
            </div>
          </div>
          <Switch
            id="reduced-motion"
            checked={prefs.reducedMotion}
            onCheckedChange={(checked) => updatePref("reducedMotion", checked)}
          />
        </div>

        {/* Focus Highlight */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MousePointer2 className="w-5 h-5 text-muted-foreground" />
            <div>
              <Label htmlFor="focus-highlight" className="font-medium">
                {t("settings.accessibility.focusHighlight", "Indicateur de focus visible")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.accessibility.focusHighlightDesc", "Affiche un contour visible pour la navigation clavier")}
              </p>
            </div>
          </div>
          <Switch
            id="focus-highlight"
            checked={prefs.focusHighlight}
            onCheckedChange={(checked) => updatePref("focusHighlight", checked)}
          />
        </div>

        {/* Reset Button */}
        <div className="pt-4 border-t">
          <Button
            variant="outline"
            onClick={resetPreferences}
            className="w-full sm:w-auto"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            {t("settings.accessibility.reset", "Réinitialiser les paramètres")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
