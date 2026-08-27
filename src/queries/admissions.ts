import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { toast } from "sonner";

export type AdmissionStatus = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "ACCEPTED" | "REJECTED" | "CONVERTED_TO_STUDENT";

export interface AdmissionDocument {
    key: string;
    url: string;
    filename: string;
    document_type: string;
}

export interface AdmissionApplication {
    id: string;
    tenant_id: string;
    academic_year_id?: string;
    academic_year_name?: string;
    level_id?: string;
    level_name?: string;
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
    documents?: AdmissionDocument[] | null;
    submitted_at?: string;
    reviewed_at?: string;
    reviewed_by?: string;
    converted_student_id?: string;
    created_at?: string;
    updated_at?: string;
}

interface AdmissionListResponse {
    items: AdmissionApplication[];
    total: number;
}

export type AdmissionStepState = "done" | "current" | "pending" | "rejected";

export interface AdmissionStep {
    key: string;
    label: string;
    date: string | null;
    state: AdmissionStepState;
}

export interface AdmissionTimelineEvent {
    action: string;
    status: string | null;
    created_at: string | null;
    actor: string | null;
    details: Record<string, unknown> | null;
}

export interface AdmissionTimeline {
    steps: AdmissionStep[];
    events: AdmissionTimelineEvent[];
}

export const admissionQueries = {
    all: (tenantId: string) => ({
        queryKey: ["admissions", tenantId] as const,
        queryFn: async (): Promise<AdmissionApplication[]> => {
            const response = await apiClient.get<AdmissionListResponse | AdmissionApplication[]>("/admissions/");
            const data = response.data;
            // API returns { items: [...], total: N }
            if (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)) {
                return data.items;
            }
            // Fallback: direct array
            if (Array.isArray(data)) {
                return data;
            }
            return [];
        },
        enabled: !!tenantId,
    }),
};

export const admissionTimelineQuery = (id: string) => ({
    queryKey: ["admission-timeline", id] as const,
    queryFn: async (): Promise<AdmissionTimeline> => {
        const response = await apiClient.get<AdmissionTimeline>(`/admissions/${id}/timeline/`);
        return response.data;
    },
    enabled: !!id,
});

// BUG RÉEL corrigé au passage : le bouton "Inscrire" (statut ACCEPTED ->
// CONVERTED_TO_STUDENT) appelait useUpdateAdmissionStatus, qui ne fait
// que PATCH /admissions/{id}/status/ — une simple mise à jour du champ
// status, sans jamais créer la ligne Student réelle. Seul
// POST /admissions/{id}/convert/ crée l'élève (matricule, classe, etc.).
// Cliquer "Inscrire" marquait donc le dossier comme inscrit sans que
// l'élève existe réellement nulle part.
export const useConvertAdmission = (tenantId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id }: { id: string }) => {
            const response = await apiClient.post(`/admissions/${id}/convert/`);
            return response.data as { student_name: string; registration_number: string };
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["admissions", tenantId] });
            toast.success(`${data.student_name} inscrit(e) — matricule ${data.registration_number}`);
        },
        onError: (error: any) => {
            toast.error("Erreur lors de l'inscription : " + (error.response?.data?.detail || error.message));
        },
    });
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
            await apiClient.patch(`/admissions/${id}/status/`, { status });
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
