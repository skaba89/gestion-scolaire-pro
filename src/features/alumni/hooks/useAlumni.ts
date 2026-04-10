/**
 * useAlumni — Sovereign hooks for the Alumni Portal.
 * Replaces all Supabase direct calls in alumni pages.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { toast } from "sonner";

const BASE = "/alumni";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AlumniRequestStats {
    pending: number;
    in_progress: number;
    completed: number;
    total: number;
}

export interface AlumniDocumentRequest {
    id: string;
    document_type: string;
    document_description?: string;
    purpose: string;
    urgency: string;
    delivery_method: string;
    delivery_address?: string;
    status: string;
    validation_notes?: string;
    created_at: string;
    updated_at?: string;
}

export interface AlumniRequestHistory {
    id: string;
    action: string;
    new_status?: string;
    notes?: string;
    created_at: string;
    performer?: { first_name: string; last_name: string };
}

export interface JobOffer {
    id: string;
    title: string;
    company_name?: string;
    offer_type: string;
    description?: string;
    location?: string;
    is_remote: boolean;
    application_deadline?: string;
    contact_email?: string;
    created_at: string;
}

export interface AlumniMentor {
    id: string;
    first_name: string;
    last_name: string;
    current_position?: string;
    current_company?: string;
    bio?: string;
    expertise_areas: string[];
    linkedin_url?: string;
}

export interface CareerEvent {
    id: string;
    title: string;
    description?: string;
    event_type?: string;
    start_datetime: string;
    location?: string;
    is_online: boolean;
}

export interface DocumentRequestFormData {
    document_type: string;
    document_description?: string;
    purpose: string;
    urgency: string;
    delivery_method: string;
    delivery_address?: string;
}


// ─── Dashboard ────────────────────────────────────────────────────────────────

export const useAlumniDashboard = () => {
    return useQuery({
        queryKey: ["alumni-dashboard"],
        queryFn: async () => {
            const { data } = await apiClient.get(`${BASE}/dashboard`);
            return data as {
                requests_stats: AlumniRequestStats;
                unread_count: number;
                recent_requests: AlumniDocumentRequest[];
            };
        },
    });
};


// ─── Document Requests ────────────────────────────────────────────────────────

export const useAlumniDocumentRequests = () => {
    const queryClient = useQueryClient();

    const { data: requests, isLoading } = useQuery({
        queryKey: ["alumni-requests"],
        queryFn: async () => {
            const { data } = await apiClient.get(`${BASE}/document-requests`);
            return data as AlumniDocumentRequest[];
        },
    });

    const createRequest = useMutation({
        mutationFn: async (body: DocumentRequestFormData) => {
            const { data } = await apiClient.post(`${BASE}/document-requests`, body);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["alumni-requests"] });
            queryClient.invalidateQueries({ queryKey: ["alumni-dashboard"] });
            toast.success("Demande soumise avec succès");
        },
        onError: () => toast.error("Erreur lors de la soumission"),
    });

    const cancelRequest = useMutation({
        mutationFn: async (requestId: string) => {
            await apiClient.patch(`${BASE}/document-requests/${requestId}/cancel`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["alumni-requests"] });
            queryClient.invalidateQueries({ queryKey: ["alumni-dashboard"] });
            toast.success("Demande annulée");
        },
        onError: () => toast.error("Impossible d'annuler la demande"),
    });

    return { requests, isLoading, createRequest, cancelRequest };
};

export const useAlumniRequestHistory = (requestId?: string) => {
    return useQuery({
        queryKey: ["alumni-request-history", requestId],
        queryFn: async () => {
            const { data } = await apiClient.get(`${BASE}/document-requests/${requestId}/history`);
            return data as AlumniRequestHistory[];
        },
        enabled: !!requestId,
    });
};


// ─── Careers ──────────────────────────────────────────────────────────────────

export const useAlumniCareers = () => {
    const { data: jobOffers, isLoading: loadingJobs } = useQuery({
        queryKey: ["alumni-jobs"],
        queryFn: async () => {
            const { data } = await apiClient.get(`${BASE}/careers/jobs`);
            return data as JobOffer[];
        },
    });

    const { data: mentors, isLoading: loadingMentors } = useQuery({
        queryKey: ["alumni-mentors"],
        queryFn: async () => {
            const { data } = await apiClient.get(`${BASE}/careers/mentors`);
            return data as AlumniMentor[];
        },
    });

    const { data: events, isLoading: loadingEvents } = useQuery({
        queryKey: ["alumni-events"],
        queryFn: async () => {
            const { data } = await apiClient.get(`${BASE}/careers/events`);
            return data as CareerEvent[];
        },
    });

    return { jobOffers, loadingJobs, mentors, loadingMentors, events, loadingEvents };
};


// ─── Messaging recipients ─────────────────────────────────────────────────────

export const useAlumniStaffRecipients = () => {
    return useQuery({
        queryKey: ["alumni-staff-recipients"],
        queryFn: async () => {
            const { data } = await apiClient.get(`${BASE}/messaging/staff-recipients`);
            return data;
        },
    });
};
