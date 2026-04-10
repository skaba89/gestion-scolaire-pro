import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { toast } from "sonner";

export type AdmissionStatus = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "ACCEPTED" | "REJECTED" | "CONVERTED_TO_STUDENT";

export interface AdmissionApplication {
    id: string;
    tenant_id: string;
    academic_year_id?: string;
    level_id?: string;
    student_first_name: string;
    student_last_name: string;
    student_date_of_birth?: string;
    student_gender?: string;
    student_address?: string;
    student_previous_school?: string;
    parent_first_name: string;
    parent_last_name: string;
    parent_email: string;
    parent_phone: string;
    parent_address?: string;
    parent_occupation?: string;
    status: AdmissionStatus;
    notes?: string;
    documents?: any;
    submitted_at?: string;
    reviewed_at?: string;
    reviewed_by?: string;
    converted_student_id?: string;
    created_at?: string;
    updated_at?: string;
}

export const admissionQueries = {
    all: (tenantId: string) => ({
        queryKey: ["admissions", tenantId] as const,
        queryFn: async () => {
            const response = await apiClient.get<AdmissionApplication[]>("/admissions");
            return response.data;
        },
        enabled: !!tenantId,
    }),
};

export const useUpdateAdmissionStatus = (tenantId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            id,
            status,
            application,
            tenantName
        }: {
            id: string;
            status: AdmissionStatus;
            application: AdmissionApplication;
            tenantName?: string;
        }) => {
            await apiClient.patch(`/admissions/${id}/status`, { status });

            // Notification logic should ideally be on the backend
            // But for compatibility with existing flow if not yet in backend:
            console.log("Admission status updated to:", status);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admissions", tenantId] });
            toast.success("Statut mis à jour avec succès");
        },
        onError: (error: any) => {
            toast.error("Erreur lors de la mise à jour du statut: " + error.message);
        },
    });
};
