import { toast as sonnerToast } from "sonner";

/**
 * Service de notification standardisé pour une interface cohérente et "Premium".
 * Encapsule 'sonner' avec des styles et comportements prédéfinis.
 */
export const toastService = {
    success: (message: string, description?: string) => {
        sonnerToast.success(message, {
            description,
            className: "border-green-100 bg-green-50/50 backdrop-blur-sm",
        });
    },

    error: (message: string, description?: string) => {
        sonnerToast.error(message, {
            description,
            className: "border-red-100 bg-red-50/50 backdrop-blur-sm",
        });
    },

    info: (message: string, description?: string) => {
        sonnerToast.info(message, {
            description,
            className: "border-blue-100 bg-blue-50/50 backdrop-blur-sm",
        });
    },

    warning: (message: string, description?: string) => {
        sonnerToast.warning(message, {
            description,
            className: "border-yellow-100 bg-yellow-50/50 backdrop-blur-sm",
        });
    },

    promise: <T>(
        promise: Promise<T>,
        loading: string,
        success: string,
        error: string
    ) => {
        return sonnerToast.promise(promise, {
            loading,
            success,
            error,
        });
    },

    loading: (message: string) => {
        return sonnerToast.loading(message);
    },

    dismiss: (id?: string | number) => {
        sonnerToast.dismiss(id);
    },
};
