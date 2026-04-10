import React, { useEffect } from "react";
import { useSettings } from "@/hooks/useSettings";

/**
 * Helper to convert hex to HSL values (space separated) for Tailwind/Shadcn
 */
function hexToHSLValues(hex: string): string | null {
    hex = hex.replace("#", "");
    if (hex.length === 3) {
        hex = hex.split("").map(c => c + c).join("");
    }
    if (hex.length !== 6) return null;

    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * DynamicThemeProvider
 * Injects CSS variables and font imports based on tenant settings
 */
export function DynamicThemeProvider({ children }: { children: React.ReactNode }) {
    const { settings } = useSettings();

    useEffect(() => {
        if (!settings) return;

        const root = document.documentElement;

        // Define colors to apply
        const colorMappings = [
            { key: "primary_color", variable: "--primary" },
            { key: "secondary_color", variable: "--secondary" },
            { key: "accent_color", variable: "--accent" },
            { key: "menu_active_color", variable: "--menu-active" },
            { key: "menu_bg_color", variable: "--menu-bg" },
            { key: "tab_active_color", variable: "--tab-active" },
        ];

        colorMappings.forEach(({ key, variable }) => {
            const hexValue = settings[key];
            if (hexValue) {
                const hslValues = hexToHSLValues(hexValue);
                if (hslValues) {
                    root.style.setProperty(variable, hslValues);
                    // Also set the ring color to primary for better UI focus states
                    if (variable === "--primary") {
                        root.style.setProperty("--ring", hslValues);
                    }
                } else {
                    // Fallback for non-hex values or if conversion fails
                    root.style.setProperty(variable, hexValue);
                }
            }
        });

        // Apply Typography
        if (settings.font_family) {
            root.style.setProperty("--font-main", settings.font_family);

            // Dynamic Google Fonts import
            const fontId = "dynamic-google-font";
            let link = document.getElementById(fontId) as HTMLLinkElement;
            if (!link) {
                link = document.createElement("link");
                link.id = fontId;
                link.rel = "stylesheet";
                document.head.appendChild(link);
            }
            const fontName = settings.font_family.replace(/\s+/g, "+");
            link.href = `https://fonts.googleapis.com/css2?family=${fontName}:wght@300;400;500;600;700&display=swap`;

            document.body.style.fontFamily = `"${settings.font_family}", sans-serif`;
        }
    }, [settings]);

    return <>{children}</>;
}
