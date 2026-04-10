import { apiClient } from "@/api/client";

/**
 * Génère 10 codes de récupération pour l'utilisateur connecté
 * @returns Array de codes de récupération (texte clair, affiché une seule fois)
 */
export const generateBackupCodes = async (): Promise<string[]> => {
    const { data } = await apiClient.post('/mfa/backup-codes/generate/');
    return data.codes as string[];
};

/**
 * Vérifie un code de récupération
 * @param code - Le code de récupération à vérifier
 * @returns true si le code est valide et non utilisé
 */
export const verifyBackupCode = async (code: string): Promise<boolean> => {
    const { data } = await apiClient.post('/mfa/backup-codes/verify/', {
        code: code.toUpperCase().trim(),
    });
    return data.valid === true;
};

/**
 * Récupère les codes de récupération de l'utilisateur (statut uniquement)
 * @returns Liste des codes avec leur statut (used, created_at, used_at)
 */
export const getBackupCodes = async () => {
    const { data } = await apiClient.get('/mfa/backup-codes/');
    return data;
};

/**
 * Compte le nombre de codes de récupération restants
 * @returns Nombre de codes non utilisés
 */
export const countRemainingBackupCodes = async (): Promise<number> => {
    try {
        const { data } = await apiClient.get('/mfa/backup-codes/count/');
        return data.count ?? 0;
    } catch {
        return 0;
    }
};
