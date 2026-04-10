import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CURRENCIES } from "@/hooks/useCurrency";

/**
 * Format a number with French locale (spaces for thousands, comma for decimals)
 * @param value - The number to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted number string (e.g., "1 234,56")
 */
export const formatNumber = (value: number, decimals: number = 2): string => {
    return value.toLocaleString('fr-FR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
};

/**
 * Resolve a currency code (e.g., "XOF") to its display symbol (e.g., "FCFA")
 * Falls back to the raw code if the currency is not found in the CURRENCIES map.
 */
export const resolveCurrencySymbol = (currencyCode: string): string => {
    const config = CURRENCIES[currencyCode];
    return config ? config.symbol : currencyCode;
};

/**
 * Resolve a currency code to its full display info (symbol, position, locale)
 */
export const resolveCurrencyConfig = (currencyCode: string) => {
    return CURRENCIES[currencyCode] || CURRENCIES.XOF;
};

/**
 * Format a number as currency with the specified currency code
 * The code is resolved to its proper symbol via the CURRENCIES map.
 * @param value - The number to format
 * @param currencyCode - Currency code (e.g., 'XOF', 'EUR'). Required.
 * @returns Formatted currency string (e.g., "1 234,56 FCFA")
 */
export const formatCurrency = (value: number, currencyCode: string = 'XOF'): string => {
    const config = CURRENCIES[currencyCode] || CURRENCIES.XOF;
    const formattedNumber = formatNumber(value, 2);
    if (config.position === "before") {
        return `${config.symbol}${formattedNumber}`;
    }
    return `${formattedNumber} ${config.symbol}`;
};

/**
 * Format a number as currency for PDF documents
 * Ensures consistent formatting across all PDF exports
 * @param value - The number to format
 * @param currencyCode - Currency code from tenant settings (e.g., 'XOF', 'EUR')
 * @returns Formatted currency string
 */
export const formatPdfCurrency = (value: number, currencyCode: string = 'XOF'): string => {
    return formatCurrency(value, currencyCode);
};

/**
 * Formate une date de manière sécurisée pour les PDF
 * @param dateString - La date à formater (string, Date, null, undefined)
 * @param defaultText - Le texte par défaut si la date est invalide
 * @returns La date formatée ou le texte par défaut
 */
export const safeFormatDate = (dateString: any, defaultText: string = "[date]"): string => {
    if (!dateString) return defaultText;
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return defaultText;
        return format(date, "dd MMMM yyyy", { locale: fr });
    } catch {
        return defaultText;
    }
};
