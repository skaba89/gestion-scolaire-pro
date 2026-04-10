import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useToast } from "@/hooks/use-toast";

export interface DocumentRequest {
  id: string;
  document_type: string;
  document_description: string | null;
  purpose: string;
  urgency: string;
  delivery_method: string;
  delivery_address: string | null;
  status: string;
  validation_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlumniDashboardStats {
  requests_stats: {
    pending: number;
    in_progress: number;
    completed: number;
    total: number;
  };
  unread_count: number;
  recent_requests: Partial<DocumentRequest>[];
}

export interface JobOffer {
  id: string;
  title: string;
  company_name: string;
  offer_type: string;
  description: string;
  location: string;
  is_remote: boolean;
  application_deadline: string | null;
  contact_email: string;
  created_at: string;
}

export interface AlumniMentor {
  id: string;
  first_name: string;
  last_name: string;
  current_position: string;
  current_company: string;
  bio: string;
  expertise_areas: string[];
  linkedin_url: string;
}

export interface CareerEvent {
  id: string;
  title: string;
  description: string;
  event_type: string;
  start_datetime: string;
  location: string;
  is_online: boolean;
}

export const useAlumniDashboard = () => {
  return useQuery({
    queryKey: ["alumni-dashboard"],
    queryFn: async () => {
      const response = await apiClient.get<AlumniDashboardStats>("/alumni/dashboard/");
      return response.data;
    },
  });
};

export const useAlumniDocumentRequests = () => {
  return useQuery({
    queryKey: ["alumni-document-requests"],
    queryFn: async () => {
      const response = await apiClient.get<DocumentRequest[]>("/alumni/document-requests/");
      return response.data;
    },
  });
};

export const useCreateDocumentRequest = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: Omit<DocumentRequest, "id" | "status" | "created_at" | "updated_at" | "validation_notes">) => {
      const response = await apiClient.post("/alumni/document-requests/", data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alumni-document-requests"] });
      queryClient.invalidateQueries({ queryKey: ["alumni-dashboard"] });
      toast({ title: "Succès", description: "Demande soumise avec succès" });
    },
  });
};

export const useCancelDocumentRequest = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const response = await apiClient.patch(`/alumni/document-requests/${requestId}/cancel/`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alumni-document-requests"] });
      queryClient.invalidateQueries({ queryKey: ["alumni-dashboard"] });
      toast({ title: "Succès", description: "Demande annulée" });
    },
  });
};

export const useAlumniJobOffers = () => {
  return useQuery({
    queryKey: ["alumni-job-offers"],
    queryFn: async () => {
      const response = await apiClient.get<JobOffer[]>("/alumni/careers/jobs/");
      return response.data;
    },
  });
};

export const useAlumniMentors = () => {
  return useQuery({
    queryKey: ["alumni-mentors"],
    queryFn: async () => {
      const response = await apiClient.get<AlumniMentor[]>("/alumni/careers/mentors/");
      return response.data;
    },
  });
};

export const useAlumniCareerEvents = () => {
  return useQuery({
    queryKey: ["alumni-career-events"],
    queryFn: async () => {
      const response = await apiClient.get<CareerEvent[]>("/alumni/careers/events/");
      return response.data;
    },
  });
};

export const useAlumniStaffRecipients = () => {
  return useQuery({
    queryKey: ["alumni-staff-recipients"],
    queryFn: async () => {
      const response = await apiClient.get<any[]>("/alumni/messaging/staff-recipients/");
      return response.data;
    },
  });
};
