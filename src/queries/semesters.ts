import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useToast } from "@/hooks/use-toast";

export interface Semester {
    id: string;
    tenant_id: string;
    academic_year_id: string;
    academic_year?: { name: string };
    name: string;
    number: number;
    start_date: string;
    end_date: string;
    is_active: boolean;
    // ECTS credits a student must have earned from THIS semester's own
    // subjects before enrolling in the next semester's subjects (see
    // backend/app/services/progression.py). null = no gate configured.
    credits_required_to_advance: number | null;
    created_at?: string;
    updated_at?: string;
}

export interface SemesterProgressionEligibility {
    eligible: boolean;
    reason: string;
    previous_semester_id?: string;
    previous_semester_name?: string;
    credits_required?: number;
    credits_earned?: number;
    credits_possible?: number;
}

export const useSemesters = (tenantId?: string) => {
    return useQuery({
        queryKey: ["semesters", tenantId],
        queryFn: async () => {
            const response = await apiClient.get<Semester[]>("/semesters/");
            return response.data;
        },
        enabled: !!tenantId,
    });
};

export const useSemesterProgressionEligibility = (semesterId?: string, studentId?: string) => {
    return useQuery({
        queryKey: ["semester-progression", semesterId, studentId],
        queryFn: async () => {
            const response = await apiClient.get<SemesterProgressionEligibility>(
                `/semesters/${semesterId}/progression/${studentId}/`
            );
            return response.data;
        },
        enabled: !!semesterId && !!studentId,
    });
};

export const useCreateSemester = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (semester: Omit<Semester, "id" | "academic_year"> & { tenant_id: string }) => {
            const response = await apiClient.post<Semester>("/semesters/", semester);
            return response.data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["semesters", data.tenant_id] });
            toast({ title: "Succès", description: "Semestre créé avec succès" });
        },
        onError: (error: any) => {
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors de la création du semestre",
                variant: "destructive",
            });
        },
    });
};

export const useUpdateSemester = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ id, ...updates }: Partial<Semester> & { id: string }) => {
            const response = await apiClient.put<Semester>(`/semesters/${id}/`, updates);
            return response.data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["semesters", data.tenant_id] });
            toast({ title: "Succès", description: "Semestre mis à jour avec succès" });
        },
        onError: (error: any) => {
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors de la mise à jour du semestre",
                variant: "destructive",
            });
        },
    });
};

export const useDeleteSemester = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ id, tenantId }: { id: string; tenantId: string }) => {
            await apiClient.delete(`/semesters/${id}/`);
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["semesters", variables.tenantId] });
            toast({ title: "Succès", description: "Semestre supprimé avec succès" });
        },
        onError: (error: any) => {
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors de la suppression du semestre",
                variant: "destructive",
            });
        },
    });
};
