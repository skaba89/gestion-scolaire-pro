/**
 * SystemSettings Component
 * Manage all dynamic system settings
 * Covers: features, localization, schedule, and more
 */

import { useState, useEffect } from "react";
import { useSettings } from "@/hooks/useSettings";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { CURRENCIES as CURRENCIES_MAP } from "@/hooks/useCurrency";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Settings as SettingsIcon,
  Save,
  RotateCcw,
  Loader2,
  Clock,
  Globe,
  Zap,
} from "lucide-react";

interface SettingGroup {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  fields: SettingField[];
}

interface SettingField {
  key: string;
  label: string;
  description?: string;
  type: "text" | "select" | "switch" | "time" | "number" | "color";
  value?: string | number | boolean;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}

const LANGUAGES = [
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "pt", label: "Português" },
  { value: "ar", label: "العربية" },
];

const COUNTRIES = [
  { value: "Guinée", label: "Guinée (Conakry)" },
  { value: "Sénégal", label: "Sénégal" },
  { value: "Mali", label: "Mali" },
  { value: "Côte d'Ivoire", label: "Côte d'Ivoire" },
  { value: "Burkina Faso", label: "Burkina Faso" },
  { value: "Togo", label: "Togo" },
  { value: "Bénin", label: "Bénin" },
  { value: "Niger", label: "Niger" },
  { value: "Mauritanie", label: "Mauritanie" },
  { value: "Gabon", label: "Gabon" },
  { value: "Cameroun", label: "Cameroun" },
  { value: "Congo", label: "Congo (Brazzaville)" },
  { value: "RDC", label: "RDC (Kinshasa)" },
  { value: "Tchad", label: "Tchad" },
  { value: "Centrafrique", label: "Centrafrique" },
  { value: "Guinée Équatoriale", label: "Guinée Équatoriale" },
  { value: "Djibouti", label: "Djibouti" },
  { value: "Comores", label: "Comores" },
  { value: "Madagascar", label: "Madagascar" },
  { value: "Maroc", label: "Maroc" },
  { value: "Algérie", label: "Algérie" },
  { value: "Tunisie", label: "Tunisie" },
  { value: "Égypte", label: "Égypte" },
  { value: "Soudan", label: "Soudan" },
  { value: "Soudan du Sud", label: "Soudan du Sud" },
  { value: "Éthiopie", label: "Éthiopie" },
  { value: "Somalie", label: "Somalie" },
  { value: "Kenya", label: "Kenya" },
  { value: "Ouganda", label: "Ouganda" },
  { value: "Tanzanie", label: "Tanzanie" },
  { value: "Rwanda", label: "Rwanda" },
  { value: "Burundi", label: "Burundi" },
  { value: "Angola", label: "Angola" },
  { value: "Zambie", label: "Zambie" },
  { value: "Malawi", label: "Malawi" },
  { value: "Mozambique", label: "Mozambique" },
  { value: "Zimbabwe", label: "Zimbabwe" },
  { value: "Botswana", label: "Botswana" },
  { value: "Namibie", label: "Namibie" },
  { value: "Afrique du Sud", label: "Afrique du Sud" },
  { value: "Lesotho", label: "Lesotho" },
  { value: "Eswatini", label: "Eswatini" },
  { value: "Nigeria", label: "Nigeria" },
  { value: "Ghana", label: "Ghana" },
  { value: "Sierra Leone", label: "Sierra Leone" },
  { value: "Libéria", label: "Libéria" },
  { value: "Gambie", label: "Gambie" },
  { value: "Guinée-Bissau", label: "Guinée-Bissau" },
  { value: "Cap-Vert", label: "Cap-Vert" },
  { value: "France", label: "France" },
  { value: "Belgique", label: "Belgique" },
  { value: "Suisse", label: "Suisse" },
  { value: "Canada", label: "Canada" },
  { value: "USA", label: "USA" },
  { value: "Royaume-Uni", label: "Royaume-Uni" },
  { value: "Allemagne", label: "Allemagne" },
  { value: "Italie", label: "Italie" },
  { value: "Espagne", label: "Espagne" },
  { value: "Émirats Arabes Unis", label: "Émirats Arabes Unis" },
  { value: "Arabie Saoudite", label: "Arabie Saoudite" },
  { value: "Turquie", label: "Turquie" },
  { value: "Chine", label: "Chine" },
  { value: "Inde", label: "Inde" },
  { value: "Brésil", label: "Brésil" },
];

const COUNTRY_DEFAULTS: Record<string, { timezone: string; currency: string; locale: string }> = {
  "Guinée": { timezone: "Africa/Conakry", currency: "GNF", locale: "fr-GN" },
  "Sénégal": { timezone: "Africa/Dakar", currency: "XOF", locale: "fr-SN" },
  "Mali": { timezone: "Africa/Bamako", currency: "XOF", locale: "fr-ML" },
  "Côte d'Ivoire": { timezone: "Africa/Abidjan", currency: "XOF", locale: "fr-CI" },
  "Burkina Faso": { timezone: "Africa/Ouagadougou", currency: "XOF", locale: "fr-BF" },
  "Togo": { timezone: "Africa/Lome", currency: "XOF", locale: "fr-TG" },
  "Bénin": { timezone: "Africa/Cotonou", currency: "XOF", locale: "fr-BJ" },
  "Niger": { timezone: "Africa/Niamey", currency: "XOF", locale: "fr-NE" },
  "Mauritanie": { timezone: "Africa/Nouakchott", currency: "MRU", locale: "fr-MR" },
  "Gabon": { timezone: "Africa/Libreville", currency: "XAF", locale: "fr-GA" },
  "Cameroun": { timezone: "Africa/Douala", currency: "XAF", locale: "fr-CM" },
  "Congo": { timezone: "Africa/Brazzaville", currency: "XAF", locale: "fr-CG" },
  "RDC": { timezone: "Africa/Kinshasa", currency: "XAF", locale: "fr-CD" },
  "Tchad": { timezone: "Africa/Ndjamena", currency: "XAF", locale: "fr-TD" },
  "Centrafrique": { timezone: "Africa/Bangui", currency: "XAF", locale: "fr-CF" },
  "Guinée Équatoriale": { timezone: "Africa/Malabo", currency: "XAF", locale: "es-GQ" },
  "Djibouti": { timezone: "Africa/Djibouti", currency: "DJF", locale: "fr-DJ" },
  "Comores": { timezone: "Indian/Comoro", currency: "KMF", locale: "fr-KM" },
  "Madagascar": { timezone: "Africa/Antananarivo", currency: "MGA", locale: "mg-MG" },
  "Maroc": { timezone: "Africa/Casablanca", currency: "MAD", locale: "ar-MA" },
  "Algérie": { timezone: "Africa/Algiers", currency: "DZD", locale: "ar-DZ" },
  "Tunisie": { timezone: "Africa/Tunis", currency: "TND", locale: "ar-TN" },
  "Égypte": { timezone: "Africa/Cairo", currency: "EGP", locale: "ar-EG" },
  "Soudan": { timezone: "Africa/Khartoum", currency: "SDG", locale: "ar-SD" },
  "Kenya": { timezone: "Africa/Nairobi", currency: "KES", locale: "en-KE" },
  "Ouganda": { timezone: "Africa/Kampala", currency: "UGX", locale: "en-UG" },
  "Tanzanie": { timezone: "Africa/Dar_es_Salaam", currency: "TZS", locale: "sw-TZ" },
  "Rwanda": { timezone: "Africa/Kigali", currency: "RWF", locale: "rw-RW" },
  "Angola": { timezone: "Africa/Luanda", currency: "AOA", locale: "pt-AO" },
  "Afrique du Sud": { timezone: "Africa/Johannesburg", currency: "ZAR", locale: "en-ZA" },
  "Nigeria": { timezone: "Africa/Lagos", currency: "NGN", locale: "en-NG" },
  "Ghana": { timezone: "Africa/Accra", currency: "GHS", locale: "en-GH" },
  "France": { timezone: "Europe/Paris", currency: "EUR", locale: "fr-FR" },
  "Belgique": { timezone: "Europe/Brussels", currency: "EUR", locale: "fr-BE" },
  "Suisse": { timezone: "Europe/Zurich", currency: "CHF", locale: "fr-CH" },
  "Canada": { timezone: "America/Montreal", currency: "CAD", locale: "fr-CA" },
  "USA": { timezone: "America/New_York", currency: "USD", locale: "en-US" },
  "Royaume-Uni": { timezone: "Europe/London", currency: "GBP", locale: "en-GB" },
  "Émirats Arabes Unis": { timezone: "Asia/Dubai", currency: "AED", locale: "ar-AE" },
  "Soudan du Sud": { timezone: "Africa/Juba", currency: "SSP", locale: "en-SS" },
  "Éthiopie": { timezone: "Africa/Addis_Ababa", currency: "ETB", locale: "am-ET" },
  "Burundi": { timezone: "Africa/Bujumbura", currency: "BIF", locale: "fr-BI" },
  "Gambie": { timezone: "Africa/Banjul", currency: "GMD", locale: "en-GM" },
  "Sierra Leone": { timezone: "Africa/Freetown", currency: "SLL", locale: "en-SL" },
  "Libéria": { timezone: "Africa/Monrovia", currency: "LRD", locale: "en-LR" },
  "Guinée-Bissau": { timezone: "Africa/Bissau", currency: "XOF", locale: "pt-GW" },
  "Cap-Vert": { timezone: "Africa/Praia", currency: "CVE", locale: "pt-CV" },
  "Allemagne": { timezone: "Europe/Berlin", currency: "EUR", locale: "de-DE" },
  "Turquie": { timezone: "Europe/Istanbul", currency: "TRY", locale: "tr-TR" },
  "Chine": { timezone: "Asia/Shanghai", currency: "CNY", locale: "zh-CN" },
};

const TIMEZONE_DEFAULTS: Record<string, { currency: string; locale: string }> = {
  "Africa/Conakry": { currency: "GNF", locale: "fr-GN" },
  "Africa/Dakar": { currency: "XOF", locale: "fr-SN" },
  "Africa/Abidjan": { currency: "XOF", locale: "fr-CI" },
  "Africa/Bamako": { currency: "XOF", locale: "fr-ML" },
  "Africa/Ouagadougou": { currency: "XOF", locale: "fr-BF" },
  "Africa/Lome": { currency: "XOF", locale: "fr-TG" },
  "Africa/Cotonou": { currency: "XOF", locale: "fr-BJ" },
  "Africa/Niamey": { currency: "XOF", locale: "fr-NE" },
  "Africa/Nouakchott": { currency: "MRU", locale: "fr-MR" },
  "Africa/Libreville": { currency: "XAF", locale: "fr-GA" },
  "Africa/Douala": { currency: "XAF", locale: "fr-CM" },
  "Africa/Brazzaville": { currency: "XAF", locale: "fr-CG" },
  "Africa/Kinshasa": { currency: "XAF", locale: "fr-CD" },
  "Africa/Lagos": { currency: "NGN", locale: "en-NG" },
  "Africa/Accra": { currency: "GHS", locale: "en-GH" },
  "Africa/Casablanca": { currency: "MAD", locale: "ar-MA" },
  "Africa/Tunis": { currency: "TND", locale: "ar-TN" },
  "Africa/Algiers": { currency: "DZD", locale: "ar-DZ" },
  "Africa/Cairo": { currency: "EGP", locale: "ar-EG" },
  "Africa/Nairobi": { currency: "KES", locale: "en-KE" },
  "Africa/Johannesburg": { currency: "ZAR", locale: "en-ZA" },
  "Africa/Luanda": { currency: "AOA", locale: "pt-AO" },
  "Africa/Kigali": { currency: "RWF", locale: "rw-RW" },
  "Europe/Paris": { currency: "EUR", locale: "fr-FR" },
  "Europe/London": { currency: "GBP", locale: "en-GB" },
  "America/Montreal": { currency: "CAD", locale: "fr-CA" },
  "America/New_York": { currency: "USD", locale: "en-US" },
  "Asia/Dubai": { currency: "AED", locale: "ar-AE" },
};

const TIMEZONES = [
  { value: "Africa/Conakry", label: "Conakry (Guinée)" },
  { value: "Africa/Dakar", label: "Dakar (Sénégal)" },
  { value: "Africa/Abidjan", label: "Abidjan (Côte d'Ivoire)" },
  { value: "Africa/Bamako", label: "Bamako (Mali)" },
  { value: "Africa/Banjul", label: "Banjul (Gambie)" },
  { value: "Africa/Bissau", label: "Bissau (Guinée-Bissau)" },
  { value: "Africa/Freetown", label: "Freetown (Sierra Leone)" },
  { value: "Africa/Monrovia", label: "Monrovia (Libéria)" },
  { value: "Africa/Ouagadougou", label: "Ouagadougou (Burkina Faso)" },
  { value: "Africa/Niamey", label: "Niamey (Niger)" },
  { value: "Africa/Nouakchott", label: "Nouakchott (Mauritanie)" },
  { value: "Africa/Lome", label: "Lomé (Togo)" },
  { value: "Africa/Cotonou", label: "Cotonou (Bénin)" },
  { value: "Africa/Lagos", label: "Lagos (Nigeria)" },
  { value: "Africa/Accra", label: "Accra (Ghana)" },
  { value: "Africa/Casablanca", label: "Casablanca (Maroc)" },
  { value: "Africa/Tunis", label: "Tunis (Tunisie)" },
  { value: "Africa/Algiers", label: "Alger (Algérie)" },
  { value: "Africa/Tripoli", label: "Tripoli (Libye)" },
  { value: "Africa/Cairo", label: "Le Caire (Égypte)" },
  { value: "Africa/Khartoum", label: "Khartoum (Soudan)" },
  { value: "Africa/Juba", label: "Juba (Soudan du Sud)" },
  { value: "Africa/Djibouti", label: "Djibouti" },
  { value: "Africa/Mogadishu", label: "Mogadiscio (Somalie)" },
  { value: "Africa/Addis_Ababa", label: "Addis-Abeba (Éthiopie)" },
  { value: "Africa/Nairobi", label: "Nairobi (Kenya)" },
  { value: "Africa/Kampala", label: "Kampala (Ouganda)" },
  { value: "Africa/Kigali", label: "Kigali (Rwanda)" },
  { value: "Africa/Bujumbura", label: "Bujumbura (Burundi)" },
  { value: "Africa/Dar_es_Salaam", label: "Dar es Salaam (Tanzanie)" },
  { value: "Africa/Libreville", label: "Libreville (Gabon)" },
  { value: "Africa/Douala", label: "Douala (Cameroun)" },
  { value: "Africa/Bangui", label: "Bangui (Centrafrique)" },
  { value: "Africa/Brazzaville", label: "Brazzaville (Congo)" },
  { value: "Africa/Kinshasa", label: "Kinshasa (RDC - Ouest)" },
  { value: "Africa/Lubumbashi", label: "Lubumbashi (RDC - Est)" },
  { value: "Africa/Luanda", label: "Luanda (Angola)" },
  { value: "Africa/Malabo", label: "Malabo (Guinée Équatoriale)" },
  { value: "Africa/Ndjamena", label: "N'Djaména (Tchad)" },
  { value: "Africa/Lusaka", label: "Lusaka (Zambie)" },
  { value: "Africa/Blantyre", label: "Blantyre (Malawi)" },
  { value: "Africa/Maputo", label: "Maputo (Mozambique)" },
  { value: "Africa/Harare", label: "Harare (Zimbabwe)" },
  { value: "Africa/Gaborone", label: "Gaborone (Botswana)" },
  { value: "Africa/Windhoek", label: "Windhoek (Namibie)" },
  { value: "Africa/Johannesburg", label: "Johannesburg (Afrique du Sud)" },
  { value: "Africa/Maseru", label: "Maseru (Lesotho)" },
  { value: "Africa/Mbabane", label: "Mbabane (Eswatini)" },
  { value: "Africa/Antananarivo", label: "Antananarivo (Madagascar)" },
  { value: "Africa/Port_Louis", label: "Port Louis (Maurice)" },
  { value: "Indian/Mahe", label: "Mahé (Seychelles)" },
  { value: "Indian/Comoro", label: "Moroni (Comores)" },
  { value: "Indian/Mayotte", label: "Mamoudzou (Mayotte)" },
  { value: "Europe/Paris", label: "Paris (France)" },
  { value: "Europe/Brussels", label: "Bruxelles (Belgique)" },
  { value: "Europe/Zurich", label: "Zurich (Suisse)" },
  { value: "Europe/London", label: "Londres (Royaume-Uni)" },
  { value: "Europe/Berlin", label: "Berlin (Allemagne)" },
  { value: "Europe/Madrid", label: "Madrid (Espagne)" },
  { value: "Europe/Rome", label: "Rome (Italie)" },
  { value: "Europe/Istanbul", label: "Istanbul (Turquie)" },
  { value: "America/Montreal", label: "Montréal (Canada)" },
  { value: "America/Toronto", label: "Toronto (Canada)" },
  { value: "America/New_York", label: "New York (USA)" },
  { value: "America/Chicago", label: "Chicago (USA)" },
  { value: "America/Los_Angeles", label: "Los Angeles (USA)" },
  { value: "Asia/Dubai", label: "Dubaï (Émirats)" },
  { value: "Asia/Riyadh", label: "Riyadh (Arabie Saoudite)" },
  { value: "Asia/Shanghai", label: "Shanghai (Chine)" },
  { value: "Asia/Tokyo", label: "Tokyo (Japon)" },
];

const CURRENCIES = Object.values(CURRENCIES_MAP)
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(curr => ({
    value: curr.code,
    label: `${curr.name} (${curr.code} ${curr.symbol})`
  }));


export function SystemSettings() {
  const { settings, updateSettings, isUpdating } = useSettings();
  const { toast } = useToast();
  const { studentsLabel } = useStudentLabel();

  const [formData, setFormData] = useState({
    // Localization
    language: "fr",
    timezone: "Africa/Dakar",
    locale: "fr-SN",
    country: "Sénégal",

    // Schedule
    schoolStartTime: "08:00",
    schoolEndTime: "16:00",
    classSessionDuration: 50,
    breakBetweenSessions: 10,

    // Finance
    currency: "XOF",
    currencySymbol: "FCFA",
    fiscalYear: "ACADEMIC",

    // Features
    enable_notifications: true,
    enable_api_access: false,
    enable_advanced_analytics: false,
    enable_ai_features: false,

    // Attendance
    autoMarkAbsence: true,
    requireJustification: false,
  });

  const [hasChanges, setHasChanges] = useState(false);

  // Load settings on mount
  useEffect(() => {
    if (settings) {
      setFormData({
        language: settings.language || "fr",
        timezone: settings.timezone || "Africa/Dakar",
        locale: settings.locale || "fr-SN",
        country: settings.country || "Sénégal",
        schoolStartTime: settings.schoolStartTime || "08:00",
        schoolEndTime: settings.schoolEndTime || "16:00",
        classSessionDuration: settings.classSessionDuration || 50,
        breakBetweenSessions: settings.breakBetweenSessions || 10,
        currency: settings.currency || "XOF",
        currencySymbol: settings.currencySymbol || "FCFA",
        fiscalYear: settings.fiscalYear || "ACADEMIC",
        enable_notifications: settings.enable_notifications !== false,
        enable_api_access: settings.enable_api_access === true,
        enable_advanced_analytics: settings.enable_advanced_analytics === true,
        enable_ai_features: settings.enable_ai_features === true,
        autoMarkAbsence: settings.autoMarkAbsence !== false,
        requireJustification: settings.requireJustification === true,
      });
      setHasChanges(false);
    }
  }, [settings]);

  const handleChange = (key: string, value: any) => {
    setFormData(prev => {
      const newData = { ...prev, [key]: value };

      // Auto-fill localization based on country
      if (key === "country" && COUNTRY_DEFAULTS[value]) {
        const defaults = COUNTRY_DEFAULTS[value];
        newData.timezone = defaults.timezone;
        newData.currency = defaults.currency;
        newData.locale = defaults.locale;

        // Also update currencySymbol if available
        const currencyInfo = CURRENCIES_MAP[defaults.currency];
        if (currencyInfo) {
          newData.currencySymbol = currencyInfo.symbol;
        }
      }

      // Auto-fill localization based on timezone
      if (key === "timezone" && TIMEZONE_DEFAULTS[value]) {
        const defaults = TIMEZONE_DEFAULTS[value];
        newData.currency = defaults.currency;
        newData.locale = defaults.locale;

        // Also update currencySymbol if available
        const currencyInfo = CURRENCIES_MAP[defaults.currency];
        if (currencyInfo) {
          newData.currencySymbol = currencyInfo.symbol;
        }
      }

      // Update currencySymbol when currency is changed directly
      if (key === "currency") {
        const currencyInfo = CURRENCIES_MAP[value];
        if (currencyInfo) {
          newData.currencySymbol = currencyInfo.symbol;
        }
      }

      return newData;
    });
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      await updateSettings(formData);
      setHasChanges(false);
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleReset = () => {
    if (settings) {
      setFormData({
        language: settings.language || "fr",
        timezone: settings.timezone || "Africa/Dakar",
        locale: settings.locale || "fr-SN",
        country: settings.country || "Sénégal",
        schoolStartTime: settings.schoolStartTime || "08:00",
        schoolEndTime: settings.schoolEndTime || "16:00",
        classSessionDuration: settings.classSessionDuration || 50,
        breakBetweenSessions: settings.breakBetweenSessions || 10,
        currency: settings.currency || "XOF",
        currencySymbol: settings.currencySymbol || "FCFA",
        fiscalYear: settings.fiscalYear || "ACADEMIC",
        enable_notifications: settings.enable_notifications !== false,
        enable_api_access: settings.enable_api_access === true,
        enable_advanced_analytics: settings.enable_advanced_analytics === true,
        enable_ai_features: settings.enable_ai_features === true,
        autoMarkAbsence: settings.autoMarkAbsence !== false,
        requireJustification: settings.requireJustification === true,
      });
      setHasChanges(false);
    }
  };

  const settingGroups: SettingGroup[] = [
    {
      id: "localization",
      title: "Localisation",
      description: "Langue, fuseau horaire et localisation",
      icon: <Globe className="w-5 h-5" />,
      fields: [
        {
          key: "country",
          label: "Pays",
          description: "Le pays de l'établissement",
          type: "select",
          value: formData.country,
          options: COUNTRIES,
        },
        {
          key: "language",
          label: "Langue par défaut",
          description: "La langue affichée dans l'interface",
          type: "select",
          value: formData.language,
          options: LANGUAGES,
        },
        {
          key: "timezone",
          label: "Fuseau horaire",
          description: "Utilisé pour les horaires et les rapports",
          type: "select",
          value: formData.timezone,
          options: TIMEZONES,
        },
        {
          key: "locale",
          label: "Format régional",
          description: "Pour les dates, nombres et devises",
          type: "text",
          value: formData.locale,
          placeholder: "ex: fr-SN, en-US",
        },
      ],
    },
    {
      id: "schedule",
      title: "Horaires Scolaires",
      description: "Configurez les heures et la durée des cours",
      icon: <Clock className="w-5 h-5" />,
      fields: [
        {
          key: "schoolStartTime",
          label: "Heure de début",
          description: "Heure de début de la journée scolaire",
          type: "time",
          value: formData.schoolStartTime,
        },
        {
          key: "schoolEndTime",
          label: "Heure de fin",
          description: "Heure de fin de la journée scolaire",
          type: "time",
          value: formData.schoolEndTime,
        },
        {
          key: "classSessionDuration",
          label: "Durée d'une séance (minutes)",
          description: "Durée standard d'un cours",
          type: "number",
          value: formData.classSessionDuration,
          min: 15,
          max: 180,
          step: 5,
        },
        {
          key: "breakBetweenSessions",
          label: "Pause entre les séances (minutes)",
          description: "Durée de la pause entre deux cours",
          type: "number",
          value: formData.breakBetweenSessions,
          min: 5,
          max: 60,
          step: 5,
        },
      ],
    },
    {
      id: "finance",
      title: "Finances",
      description: "Paramètres financiers et de facturation",
      icon: <SettingsIcon className="w-5 h-5" />,
      fields: [
        {
          key: "currency",
          label: "Devise",
          description: "Devise utilisée pour la facturation",
          type: "select",
          value: formData.currency,
          options: CURRENCIES,
        },
        {
          key: "fiscalYear",
          label: "Année fiscale",
          description: "Période de l'année fiscale",
          type: "select",
          value: formData.fiscalYear,
          options: [
            { value: "ACADEMIC", label: "Année académique (Sept-Août)" },
            { value: "CALENDAR", label: "Année civile (Jan-Déc)" },
            { value: "CUSTOM", label: "Personnalisé" },
          ],
        },
      ],
    },
    {
      id: "features",
      title: "Fonctionnalités",
      description: "Activez ou désactivez les fonctionnalités avancées",
      icon: <Zap className="w-5 h-5" />,
      fields: [
        {
          key: "enable_notifications",
          label: "Notifications",
          description: "Activer les notifications pour les utilisateurs",
          type: "switch",
          value: formData.enable_notifications,
        },
        {
          key: "enable_api_access",
          label: "Accès API",
          description: "Permettre l'intégration avec des applications externes",
          type: "switch",
          value: formData.enable_api_access,
        },
        {
          key: "enable_advanced_analytics",
          label: "Analyse Avancée",
          description: "Analyser les données en détail (peut être gourmand en ressources)",
          type: "switch",
          value: formData.enable_advanced_analytics,
        },
        {
          key: "enable_ai_features",
          label: "Fonctionnalités IA",
          description: "Utiliser l'intelligence artificielle pour les recommandations",
          type: "switch",
          value: formData.enable_ai_features,
        },
      ],
    },
    {
      id: "attendance",
      title: "Gestion des Présences",
      description: "Paramètres pour le suivi des absences",
      icon: <SettingsIcon className="w-5 h-5" />,
      fields: [
        {
          key: "autoMarkAbsence",
          label: "Marquer les absences automatiquement",
          description: `Marquer absent les ${studentsLabel} non présents après 10 minutes`,
          type: "switch",
          value: formData.autoMarkAbsence,
        },
        {
          key: "requireJustification",
          label: "Justification obligatoire",
          description: "Exiger une justification pour chaque absence",
          type: "switch",
          value: formData.requireJustification,
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {settingGroups.map((group) => (
        <Card key={group.id}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                {group.icon}
              </div>
              <div>
                <CardTitle>{group.title}</CardTitle>
                <CardDescription>{group.description}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {group.fields.map((field) => (
              <div key={field.key}>
                {field.type === "switch" ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base font-semibold block mb-1">
                        {field.label}
                      </Label>
                      {field.description && (
                        <p className="text-sm text-muted-foreground">
                          {field.description}
                        </p>
                      )}
                    </div>
                    <Switch
                      checked={field.value as boolean}
                      onCheckedChange={(value) =>
                        handleChange(field.key, value)
                      }
                    />
                  </div>
                ) : field.type === "select" ? (
                  <div>
                    <Label htmlFor={field.key} className="text-base font-semibold mb-2 block">
                      {field.label}
                    </Label>
                    {field.description && (
                      <p className="text-sm text-muted-foreground mb-3">
                        {field.description}
                      </p>
                    )}
                    <Select
                      value={field.value as string}
                      onValueChange={(value) =>
                        handleChange(field.key, value)
                      }
                    >
                      <SelectTrigger id={field.key}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options?.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : field.type === "time" ? (
                  <div>
                    <Label htmlFor={field.key} className="text-base font-semibold mb-2 block">
                      {field.label}
                    </Label>
                    {field.description && (
                      <p className="text-sm text-muted-foreground mb-3">
                        {field.description}
                      </p>
                    )}
                    <Input
                      id={field.key}
                      type="time"
                      value={field.value as string}
                      onChange={(e) =>
                        handleChange(field.key, e.target.value)
                      }
                    />
                  </div>
                ) : field.type === "number" ? (
                  <div>
                    <Label htmlFor={field.key} className="text-base font-semibold mb-2 block">
                      {field.label}
                    </Label>
                    {field.description && (
                      <p className="text-sm text-muted-foreground mb-3">
                        {field.description}
                      </p>
                    )}
                    <Input
                      id={field.key}
                      type="number"
                      value={field.value as number}
                      onChange={(e) =>
                        handleChange(field.key, parseInt(e.target.value) || 0)
                      }
                      min={field.min}
                      max={field.max}
                      step={field.step}
                    />
                  </div>
                ) : (
                  <div>
                    <Label htmlFor={field.key} className="text-base font-semibold mb-2 block">
                      {field.label}
                    </Label>
                    {field.description && (
                      <p className="text-sm text-muted-foreground mb-3">
                        {field.description}
                      </p>
                    )}
                    <Input
                      id={field.key}
                      type={field.type}
                      value={field.value as string}
                      onChange={(e) =>
                        handleChange(field.key, e.target.value)
                      }
                      placeholder={field.placeholder}
                    />
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end sticky bottom-4">
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={isUpdating || !hasChanges}
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Réinitialiser
        </Button>
        <Button
          onClick={handleSave}
          disabled={isUpdating || !hasChanges}
        >
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
