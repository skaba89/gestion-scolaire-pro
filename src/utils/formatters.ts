import { format } from "date-fns";
import { fr } from "date-fns/locale";

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
 * Format a number as currency with the specified currency symbol
 * @param value - The number to format
 * @param currency - Currency symbol (default: '€')
 * @returns Formatted currency string (e.g., "1 234,56 €")
 */
export const formatCurrency = (value: number, currency: string = '€'): string => {
    return `${formatNumber(value, 2)} ${currency}`;
};

/**
 * Format a number as currency for PDF documents
 * Ensures consistent formatting across all PDF exports
 * @param value - The number to format
 * @param currency - Currency symbol from tenant settings
 * @returns Formatted currency string
 */
export const formatPdfCurrency = (value: number, currency: string = '€'): string => {
    return formatCurrency(value, currency);
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
