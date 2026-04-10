/**
 * File Security Utility
 * Standardizes validation for all file uploads in the application.
 */

export const ALLOWED_FILE_TYPES = {
    IMAGES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
    DOCUMENTS: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    SPREADSHEETS: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'],
    ARCHIVES: ['application/zip', 'application/x-rar-compressed'],
};

export const MAX_FILE_SIZES = {
    AVATAR: 2 * 1024 * 1024, // 2MB
    SIGNATURE: 1 * 1024 * 1024, // 1MB
    DOCUMENT: 10 * 1024 * 1024, // 10MB
    ATTACHMENT: 20 * 1024 * 1024, // 20MB
};

export interface FileValidationResult {
    isValid: boolean;
    error?: string;
}

export const validateFile = (
    file: File,
    options: {
        allowedTypes?: string[];
        maxSize?: number;
    }
): FileValidationResult => {
    // 1. Check File Size
    if (options.maxSize && file.size > options.maxSize) {
        const sizeInMB = (options.maxSize / (1024 * 1024)).toFixed(1);
        return {
            isValid: false,
            error: `Le fichier est trop volumineux. Taille max: ${sizeInMB} MB.`
        };
    }

    // 2. Check File Type
    if (options.allowedTypes && !options.allowedTypes.includes(file.type)) {
        return {
            isValid: false,
            error: "Type de fichier non autorisé."
        };
    }

    // 3. Optional: Magic Number validation (more advanced, usually done on server)
    // For now, we trust the MIME type from the browser but enforcing it here 
    // helps UX and basic security.

    return { isValid: true };
};

export const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
