import { apiClient } from "@/api/client";

/**
 * Demande l'envoi d'un code OTP par email
 * Rate limit: 3 codes par heure
 */
export const requestEmailOTP = async (email: string): Promise<{ success: boolean; remaining: number }> => {
    try {
        const { data } = await apiClient.post<{ success: boolean; remaining: number }>("/mfa/otp/request/", { email });
        return data;
    } catch (error: any) {
        console.error("Error requesting OTP:", error);
        throw error;
    }
};

/**
 * Vérifie un code OTP reçu par email
 */
export const verifyEmailOTP = async (code: string): Promise<boolean> => {
    try {
        const { data } = await apiClient.post<{ valid: boolean }>("/mfa/otp/verify/", { code });
        return data.valid;
    } catch (error: any) {
        console.error("Error verifying OTP:", error);
        throw error;
    }
};

/**
 * Obtient le nombre de tentatives restantes pour l'heure en cours
 */
export const getRemainingOTPAttempts = async (): Promise<number> => {
    try {
        const { data } = await apiClient.get<{ remaining: number }>("/mfa/otp/remaining/");
        return data.remaining;
    } catch (error: any) {
        console.error("Error getting remaining attempts:", error);
        return 0;
    }
};
