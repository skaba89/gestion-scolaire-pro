import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useToast } from "@/hooks/use-toast";

export interface Subject {
    id: string;
    name: string;
    code: string | null;
    department_id?: string | null;
    department?: { name: string } | { name: string }[] | null;
    coefficient: number | null;
    ects?: number | null;
    cm_hours?: number | null;
    td_hours?: number | null;
    tp_hours?: number | null;
    description?: string | null;
}

export interface SubjectLevel {
    subject_id: string;
    level_id: string;
}

export const useSubjects = (tenantId?: string) => {
    return useQuery({
        queryKey: ["subjects", tenantId],
        queryFn: async () => {
            const response = await apiClient.get<Subject[]>("/subjects/");
            return response.data;
        },
        enabled: !!tenantId,
    });
};

export const useSubjectLevels = (subjectId?: string) => {
    return useQuery({
        queryKey: ["subject-levels", subjectId],
        queryFn: async () => {
            if (!subjectId) return [];
            const response = await apiClient.get<string[]>(`/subjects/${subjectId}/levels/`);
            return response.data;
        },
        enabled: !!subjectId,
    });
};

export const useAllSubjectLevels = (tenantId?: string) => {
    return useQuery({
        queryKey: ["all-subject-levels", tenantId],
        queryFn: async () => {
            const response = await apiClient.get<SubjectLevel[]>("/infrastructure/all-subject-levels/");
            return response.data;
        },
        enabled: !!tenantId,
    });
};

export const useClassroomDepartments = (tenantId?: string) => {
    return useQuery({
        queryKey: ["classroom-departments", tenantId],
        queryFn: async () => {
            const response = await apiClient.get<any[]>("/infrastructure/classroom-departments/");
            return response.data;
        },
        enabled: !!tenantId,
    });
};

export const useClassSubjects = (classId: string) => {
    return useQuery({
        queryKey: ["class-subjects", classId],
        queryFn: async () => {
            if (!classId || classId === "all") return [];
            const response = await apiClient.get<string[]>(`/infrastructure/classrooms/${classId}/subjects/`);
            return response.data;
        },
        enabled: !!classId && classId !== "all",
    });
};

export const useCreateSubject = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({
            subject,
            departmentIds,
            levelIds
        }: {
            subject: Omit<Subject, "id"> & { tenant_id: string },
            departmentIds?: string[],
            levelIds?: string[]
        }) => {
            const response = await apiClient.post<Subject>("/subjects/", {
                ...subject,
                department_ids: departmentIds,
                level_ids: levelIds
            });
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["subjects"] });
            toast({ title: "Succès", description: "Matière créée avec succès" });
        },
        onError: (error: any) => {
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors de la création de la matière",
                variant: "destructive",
            });
        },
    });
};

export const useUpdateSubject = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({
            id,
            updates,
            departmentIds,
            levelIds
        }: {
            id: string,
            updates: Partial<Subject>,
            departmentIds?: string[],
            levelIds?: string[]
        }) => {
            const response = await apiClient.put<Subject>(`/subjects/${id}/`, {
                ...updates,
                department_ids: departmentIds,
                level_ids: levelIds
            });
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["subjects"] });
            toast({ title: "Succès", description: "Matière mise à jour avec succès" });
        },
        onError: (error: any) => {
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors de la mise à jour de la matière",
                variant: "destructive",
            });
        },
    });
};

export const useDeleteSubject = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`/subjects/${id}/`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["subjects"] });
            toast({ title: "Succès", description: "Matière supprimée avec succès" });
        },
        onError: (error: any) => {
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors de la suppression de la matière",
                variant: "destructive",
            });
        },
    });
};

export const useAssignSubjectToLevel = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({
            subjectId,
            levelId,
            assign
        }: {
            subjectId: string;
            levelId: string;
            assign: boolean;
        }) => {
            // Updated to use the new association logic if available, or stay with direct link if it's a dedicated endpoint
            if (assign) {
                await apiClient.post(`/subjects/${subjectId}/levels/${levelId}/`);
            } else {
                await apiClient.delete(`/subjects/${subjectId}/levels/${levelId}/`);
            }
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["subject-levels", variables.subjectId] });
            queryClient.invalidateQueries({ queryKey: ["all-subject-levels"] });
        },
        onError: (error: any) => {
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors de l'assignation",
                variant: "destructive",
            });
        },
    });
};

export const useSubjectsByLevel = (levelId?: string) => {
    return useQuery({
        queryKey: ["subjects-by-level", levelId],
        queryFn: async () => {
            if (!levelId) return [];
            const response = await apiClient.get<string[]>(`/levels/${levelId}/subjects/`);
            return response.data;
        },
        enabled: !!levelId,
    });
};

export const useSubjectDepartmentAssociations = (subjectId?: string, tenantId?: string) => {
    return useQuery({
        queryKey: ["subject-department-associations", subjectId],
        queryFn: async () => {
            if (!subjectId || !tenantId) return [];
            const response = await apiClient.get<string[]>(`/subjects/${subjectId}/departments/`);
            return response.data;
        },
        enabled: !!subjectId && !!tenantId,
    });
};
