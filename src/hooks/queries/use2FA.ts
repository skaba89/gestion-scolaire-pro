import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export interface TwoFactorStatus {
    enabled: boolean;
}

/**
 * Hook to get user's MFA status
 */
export const useMFAStatus = () => {
    const { user } = useAuth();

    return useQuery({
        queryKey: ["mfa-status", user?.id],
        queryFn: async () => {
            if (!user?.id) return null;
            const response = await apiClient.get<{ enabled: boolean }>("/mfa/status/");
            return response.data;
        },
        enabled: !!user?.id,
    });
};

/**
 * Hook to toggle MFA
 */
export const useToggleMFA = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (enabled: boolean) => {
            const response = await apiClient.post("/mfa/toggle/", { enabled });
            return response.data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["mfa-status"] });
            toast.success(data.enabled ? "MFA activé" : "MFA désactivé");
        },
        onError: (error: any) => {
            toast.error("Erreur: " + (error.response?.data?.detail || error.message));
        },
    });
};

/**
 * Hook to request email OTP
 */
export const useRequestOTP = () => {
    const { user } = useAuth();

    return useMutation({
        mutationFn: async () => {
            if (!user?.email) throw new Error("Email non trouvé");
            const response = await apiClient.post("/mfa/otp/request/", { email: user.email });
            return response.data;
        },
        onSuccess: () => {
            toast.success("Code de vérification envoyé par email");
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.detail || "Erreur lors de l'envoi");
        },
    });
};

/**
 * Hook to verify email OTP
 */
export const useVerifyOTP = () => {
    return useMutation({
        mutationFn: async (code: string) => {
            const response = await apiClient.post("/mfa/otp/verify/", { code });
            return response.data;
        },
        onError: (error: any) => {
            toast.error("Code invalide ou expiré");
        },
    });
};

/**
 * Hook to generate backup codes
 */
export const useGenerateBackupCodes = () => {
    return useMutation({
        mutationFn: async () => {
            const response = await apiClient.post<{ codes: string[] }>("/mfa/backup-codes/generate/");
            return response.data;
        },
        onSuccess: () => {
            toast.success("Nouveaux codes de secours générés");
        },
    });
};

/**
 * Hook to list backup codes (status only)
 */
export const useBackupCodes = () => {
    const { user } = useAuth();

    return useQuery({
        queryKey: ["mfa-backup-codes", user?.id],
        queryFn: async () => {
            const response = await apiClient.get<any[]>("/mfa/backup-codes/");
            return response.data;
        },
        enabled: !!user?.id,
    });
};

/**
 * TOTP (authenticator app) — genuine second factor, distinct from the
 * email-OTP hooks above (used by SecuritySettings.tsx's own toggle flow).
 *
 * SECURITY (national-readiness audit, 2026-09, P1-5): these used to be
 * aliases onto the email-OTP hooks (useEnrollMFA = useRequestOTP, etc.)
 * under a TOTP-branded UI (QR code, "scan with your authenticator app" —
 * see ProfileSettings.tsx). useRequestOTP()'s response never contained a
 * `totp` field, so `enrollmentData.totp.uri` was always undefined and the
 * enrollment dialog crashed for anyone who tried to turn 2FA on this way.
 * They now call the real /mfa/totp/* endpoints.
 */

interface TOTPFactor {
    id: string;
    status: 'verified';
    factor_type: 'totp';
}

export const useMFAFactors = () => {
    const { user } = useAuth();
    return useQuery({
        queryKey: ["totp-status", user?.id],
        queryFn: async () => {
            const response = await apiClient.get<{ enabled: boolean }>("/mfa/totp/status/");
            const totp: TOTPFactor[] = response.data.enabled
                ? [{ id: 'active', status: 'verified', factor_type: 'totp' }]
                : [];
            return { totp, all: totp };
        },
        enabled: !!user?.id,
    });
};

export const useEnrollMFA = () => {
    return useMutation({
        mutationFn: async () => {
            const response = await apiClient.post<{ secret: string; uri: string }>("/mfa/totp/enroll/");
            return { id: 'pending', totp: response.data };
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.detail || "Erreur lors de l'enrôlement");
        },
    });
};

export const useChallengeAndVerifyMFA = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ code }: { factorId?: string; code: string }) => {
            const response = await apiClient.post<{ valid: boolean }>("/mfa/totp/verify/", { code });
            if (!response.data.valid) {
                throw new Error("Code invalide");
            }
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["totp-status"] });
            queryClient.invalidateQueries({ queryKey: ["mfa-status"] });
            toast.success("Authentification à deux facteurs activée");
        },
        onError: () => {
            toast.error("Code invalide");
        },
    });
};

export const useUnenrollMFA = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            const response = await apiClient.post("/mfa/totp/disable/");
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["totp-status"] });
            queryClient.invalidateQueries({ queryKey: ["mfa-status"] });
            toast.success("Authentification à deux facteurs désactivée");
        },
    });
};

export const useRegenerateBackupCodes = () => useGenerateBackupCodes();
