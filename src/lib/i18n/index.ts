/**
 * Ré-export de l'instance i18n canonique.
 *
 * ATTENTION : ce module NE DOIT PLUS initialiser i18next. Il existait
 * auparavant une seconde `i18n.init()` ici, avec un jeu de traductions
 * réduit (15 clés). Comme i18next est un singleton, importer ce module
 * (ex. LanguageSwitcher pour `languages`) ré-initialisait l'instance et
 * corrompait le magasin de traductions : des pages entières (ex. le scan
 * QR) affichaient les clés « humanisées » (« Page title »…) au lieu du
 * texte traduit. La configuration unique vit dans `@/i18n/config`.
 */
import i18n from "@/i18n/config";

export const languages = [
  { code: "fr", name: "Français", flag: "🇫🇷", dir: "ltr" },
  { code: "en", name: "English", flag: "🇬🇧", dir: "ltr" },
  { code: "zh", name: "中文", flag: "🇨🇳", dir: "ltr" },
  { code: "es", name: "Español", flag: "🇪🇸", dir: "ltr" },
  { code: "ar", name: "العربية", flag: "🇸🇦", dir: "rtl" },
];

export default i18n;
