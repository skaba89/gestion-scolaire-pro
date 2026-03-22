import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { toast } from "sonner";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  type: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  is_active: boolean;
  created_at?: string;
}

export const tenantQueries = {
  all: () => ({
    queryKey: ["all-tenants"] as const,
    queryFn: async () => {
      const response = await apiClient.get<Tenant[]>("/tenants/");
      return response.data;
    },
  }),
  stats: (tenantId: string) => ({
    queryKey: ["tenant-stats", tenantId] as const,
    queryFn: async () => {
      // For now, we don't have a dedicated stats endpoint for superadmin, 
      // but we can either add one or skip for now.
      // Let's assume there is a placeholder or we use the public one.
      return {
        students: 0,
        users: 0,
        classrooms: 0,
      };
    },
    enabled: !!tenantId,
  }),
};

export const useUpdateTenant = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Tenant> & { id: string }) => {
      const response = await apiClient.patch(`/tenants/${id}/`, updates);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-tenants"] });
      toast.success("Établissement mis à jour");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Erreur lors de la mise à jour");
    },
  });
};
