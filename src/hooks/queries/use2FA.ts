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

// Legacy alias for compatibility with existing components if needed
export const useMFAFactors = () => {
    const { data: status } = useMFAStatus();
    return {
        data: {
            all: status?.enabled ? [{ factor_type: 'totp', status: 'verified', id: 'active' }] : []
        },
        isLoading: false
    };
};

export const useEnrollMFA = () => useRequestOTP();
export const useChallengeAndVerifyMFA = () => {
    const verify = useVerifyOTP();
    const toggle = useToggleMFA();
    
    return {
        ...verify,
        mutateAsync: async ({ code }: { code: string }) => {
            const res = await verify.mutateAsync(code);
            if (res.valid) {
                await toggle.mutateAsync(true);
            } else {
                throw new Error("Code invalide");
            }
            return res;
        }
    };
};
export const useUnenrollMFA = () => {
    const toggle = useToggleMFA();
    return {
        ...toggle,
        mutateAsync: async () => toggle.mutateAsync(false)
    };
};
export const useRegenerateBackupCodes = () => useGenerateBackupCodes();
