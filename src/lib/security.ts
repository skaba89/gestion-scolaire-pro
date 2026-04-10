/**
 * Security utilities for SchoolFlow Pro
 * Focus on OWASP Top 10 mitigations for frontend
 */

/**
 * Sanitizes a value for CSV export to prevent Formula Injection (CSV Injection).
 * Any value starting with =, +, -, @, or tab/return is prefixed with a single quote.
 */
export const sanitizeForCSV = (value: any): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.length === 0) return '';

    // Dangerous characters that can trigger formula execution in Excel/Sheets
    const dangerousChars = ['=', '+', '-', '@', '\t', '\r'];
    if (dangerousChars.includes(str.charAt(0))) {
        return `'${str}`;
    }
    return str;
};

/**
 * Escapes HTML to prevent XSS (fallback for non-React contexts)
 */
export const escapeHTML = (str: string): string => {
    return str.replace(/[&<>"']/g, (m) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[m] || m));
};
