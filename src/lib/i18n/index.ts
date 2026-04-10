import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import fr from "./locales/fr.json";
import en from "./locales/en.json";
import zh from "./locales/zh.json";
import es from "./locales/es.json";
import ar from "./locales/ar.json";

export const languages = [
  { code: "fr", name: "Français", flag: "🇫🇷", dir: "ltr" },
  { code: "en", name: "English", flag: "🇬🇧", dir: "ltr" },
  { code: "zh", name: "中文", flag: "🇨🇳", dir: "ltr" },
  { code: "es", name: "Español", flag: "🇪🇸", dir: "ltr" },
  { code: "ar", name: "العربية", flag: "🇸🇦", dir: "rtl" },
];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
      zh: { translation: zh },
      es: { translation: es },
      ar: { translation: ar },
    },
    fallbackLng: "fr",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });

export default i18n;
