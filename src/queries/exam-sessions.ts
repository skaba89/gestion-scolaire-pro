import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { apiClient } from "@/api/client";
import { useToast } from "@/hooks/use-toast";

export type ExamSessionType = "REGULAR" | "RETAKE";
export type ExamSessionStatus = "DRAFT" | "OPEN" | "CLOSED";
export type ExamSelectionPolicy = "BEST" | "LATEST";

export interface ExamSession {
  id: string;
  tenant_id: string;
  semester_id: string;
  code: string;
  name: string;
  session_type: ExamSessionType;
  sequence: number;
  starts_on: string;
  ends_on: string;
  status: ExamSessionStatus;
  selection_policy: ExamSelectionPolicy;
  revision: number;
  assessment_count: number;
}

export interface ExamSessionInput {
  semester_id: string;
  code: string;
  name: string;
  session_type: ExamSessionType;
  sequence: number;
  starts_on: string;
  ends_on: string;
  selection_policy: ExamSelectionPolicy;
}

const detail = (error: unknown, fallback: string) =>
  axios.isAxiosError<{ detail?: string }>(error) ? error.response?.data?.detail || fallback : fallback;

export const useExamSessions = (tenantId?: string, enabled = true) => useQuery({
  queryKey: ["exam-sessions", tenantId],
  queryFn: () => apiClient.get<ExamSession[]>("/exam-sessions/").then(response => response.data),
  enabled: !!tenantId && enabled,
});

export const useCreateExamSession = () => {
  const client = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (body: ExamSessionInput) => apiClient.post<ExamSession>("/exam-sessions/", body).then(r => r.data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["exam-sessions"] });
      toast({ title: "Succès", description: "Session d'examen créée" });
    },
    onError: (error: unknown) => toast({
      title: "Erreur", description: detail(error, "Création de la session impossible"), variant: "destructive",
    }),
  });
};

export const useTransitionExamSession = () => {
  const client = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, expected_revision, status }: {
      id: string; expected_revision: number; status: "OPEN" | "CLOSED";
    }) => apiClient.patch<ExamSession>(`/exam-sessions/${id}/`, { expected_revision, status }).then(r => r.data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["exam-sessions"] });
      toast({ title: "Succès", description: "État de la session mis à jour" });
    },
    onError: (error: unknown) => toast({
      title: "Erreur", description: detail(error, "Changement d'état impossible"), variant: "destructive",
    }),
  });
};
