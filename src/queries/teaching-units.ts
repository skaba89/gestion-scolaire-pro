import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { apiClient } from "@/api/client";
import { useToast } from "@/hooks/use-toast";

export interface TeachingUnit {
  id: string;
  tenant_id: string;
  semester_id: string;
  code: string;
  name: string;
  ects: number;
  is_active: boolean;
  revision: number;
  subject_count: number;
  assigned_ects: number;
  ects_consistent: boolean;
}

export interface TeachingUnitInput {
  semester_id: string;
  code: string;
  name: string;
  ects: number;
  is_active: boolean;
}

const detail = (error: unknown, fallback: string) =>
  axios.isAxiosError<{ detail?: string }>(error) ? error.response?.data?.detail || fallback : fallback;

export const useTeachingUnits = (tenantId?: string) => useQuery({
  queryKey: ["teaching-units", tenantId],
  queryFn: () => apiClient.get<TeachingUnit[]>("/teaching-units/").then((response) => response.data),
  enabled: !!tenantId,
});

export const useCreateTeachingUnit = () => {
  const client = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (body: TeachingUnitInput) => apiClient.post<TeachingUnit>("/teaching-units/", body).then(r => r.data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["teaching-units"] });
      toast({ title: "Succès", description: "Unité d'enseignement créée" });
    },
    onError: (error: unknown) => toast({ title: "Erreur", description: detail(error, "Création impossible"), variant: "destructive" }),
  });
};

export const useUpdateTeachingUnit = () => {
  const client = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, expected_revision, ...body }: TeachingUnitInput & { id: string; expected_revision: number }) =>
      apiClient.patch<TeachingUnit>(`/teaching-units/${id}/`, { ...body, expected_revision }).then(r => r.data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["teaching-units"] });
      toast({ title: "Succès", description: "Unité d'enseignement mise à jour" });
    },
    onError: (error: unknown) => toast({ title: "Erreur", description: detail(error, "Mise à jour impossible"), variant: "destructive" }),
  });
};
