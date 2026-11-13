import { arSA, enGB, es, fr, zhCN, type Locale } from "date-fns/locale";
// Instance i18next partagée (initialisée par @/i18n/config au démarrage) ;
// pas d'import de la config ici, pour ne pas dépendre de react-i18next.
import i18n from "i18next";

/** Locale Intl de la langue d'interface (dates, nombres). */
const INTL_LOCALES: Record<string, string> = {
    fr: "fr-FR",
    en: "en-GB",
    es: "es-ES",
    ar: "ar",
    zh: "zh-CN",
};

export function intlLocale(language: string = i18n.language): string {
    return INTL_LOCALES[(language || "fr").split("-")[0]] ?? "fr-FR";
}

/** Date courte dans la langue de l'interface (remplace toLocaleDateString("fr-FR")). */
export function formatDate(value: string | number | Date | null | undefined, options?: Intl.DateTimeFormatOptions): string {
    if (value === null || value === undefined || value === "") return "";
    return new Date(value).toLocaleDateString(intlLocale(), options);
}

/** Date et heure dans la langue de l'interface. */
export function formatDateTime(value: string | number | Date | null | undefined, options?: Intl.DateTimeFormatOptions): string {
    if (value === null || value === undefined || value === "") return "";
    return new Date(value).toLocaleString(intlLocale(), options);
}

/** Nombre dans la langue de l'interface (les montants restent en GNF). */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    return value.toLocaleString(intlLocale(), options);
}

const DATE_FNS_LOCALES: Record<string, Locale> = { fr, en: enGB, es, ar: arSA, zh: zhCN };

/** Locale date-fns de la langue d'interface (format(), formatDistance()…). */
export function dateFnsLocale(language: string = i18n.language): Locale {
    return DATE_FNS_LOCALES[(language || "fr").split("-")[0]] ?? fr;
}
