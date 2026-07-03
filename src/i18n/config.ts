import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import fr from './locales/fr.json';
import en from './locales/en.json';
import es from './locales/es.json';
import zh from './locales/zh.json';
import ar from './locales/ar.json';

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            fr: { translation: fr },
            en: { translation: en },
            es: { translation: es },
            zh: { translation: zh },
            ar: { translation: ar },
        },
        supportedLngs: ['fr', 'en', 'es', 'zh', 'ar'],
        // Normalize 'fr-FR' → 'fr', 'en-US' → 'en', etc.
        load: 'languageOnly',
        fallbackLng: 'fr',
        lng: 'fr', // Default language
        debug: false,
        // Synchronous init — resources are bundled, no async loading needed
        initImmediate: false,
        interpolation: {
            escapeValue: false, // React already escapes
        },
        react: {
            // CRITICAL: Disable Suspense to prevent race conditions where
            // components render before i18n is fully initialized, causing
            // raw translation keys to display instead of translated text.
            useSuspense: false,
        },
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
            lookupLocalStorage: 'i18nextLng',
        },
    });

export default i18n;
