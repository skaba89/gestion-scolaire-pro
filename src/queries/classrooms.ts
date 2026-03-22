import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useToast } from "@/hooks/use-toast";

export interface Classroom {
    id: string;
    name: string;
    capacity: number | null;
    level_id: string | null;
    campus_id: string | null;
    tenant_id: string;
    program_id?: string | null;
    academic_year_id?: string | null;
    level?: { name: string };
    campus?: { name: string };
    enrollment_count?: number;
    main_room_id?: string | null;
    room?: { name: string };
}

export const useClassrooms = (tenantId: string) => {
    return useQuery({
        queryKey: ['classrooms', tenantId],
        queryFn: async () => {
            const response = await apiClient.get<Classroom[]>("/infrastructure/classrooms/");
            return response.data;
        },
        enabled: !!tenantId,
    });
};

export const useEnrollments = (classroomId: string) => {
    return useQuery({
        queryKey: ['enrollments', 'classroom', classroomId],
        queryFn: async () => {
            const response = await apiClient.get<any[]>(`/infrastructure/enrollments/`, {
                params: { class_id: classroomId }
            });
            return response.data;
        },
        enabled: !!classroomId,
    });
};

export const useClassroomDepartments = (classroomId: string) => {
    return useQuery({
        queryKey: ['classroom_departments', classroomId],
        queryFn: async () => {
            const response = await apiClient.get<string[]>(`/infrastructure/classrooms/${classroomId}/departments/`);
            return response.data;
        },
        enabled: !!classroomId,
    });
};

export const useClassroomSubjects = (classroomId: string) => {
    return useQuery({
        queryKey: ['class_subjects', classroomId],
        queryFn: async () => {
            const response = await apiClient.get<any[]>(`/infrastructure/classrooms/${classroomId}/subjects/`);
            return response.data;
        },
        enabled: !!classroomId,
    });
};

export const useRoomsCount = (tenantId?: string) => {
    return useQuery({
        queryKey: ["rooms-count", tenantId],
        queryFn: async () => {
            const response = await apiClient.get<number>("/infrastructure/rooms/count/");
            return response.data;
        },
        enabled: !!tenantId,
    });
};

export const useAllRooms = (tenantId?: string) => {
    return useQuery({
        queryKey: ["rooms-list", tenantId],
        queryFn: async () => {
            const response = await apiClient.get<any[]>("/infrastructure/rooms/");
            return response.data;
        },
        enabled: !!tenantId,
    });
};

export const useCreateClassroom = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ classroom, departmentIds }: {
            classroom: Omit<Classroom, 'id'>,
            departmentIds?: string[]
        }) => {
            const response = await apiClient.post<Classroom>("/infrastructure/classrooms/", {
                ...classroom,
                department_ids: departmentIds
            });
            return response.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["classrooms"] });
            toast({ title: "Succès", description: "Classe créée avec succès" });
        },
        onError: (error: any) => {
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors de la création de la classe",
                variant: "destructive",
            });
        },
    });
};

export const useUpdateClassroom = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ id, updates, departmentIds }: {
            id: string,
            updates: Partial<Classroom>,
            departmentIds?: string[]
        }) => {
            const response = await apiClient.put<Classroom>(`/infrastructure/classrooms/${id}/`, {
                ...updates,
                department_ids: departmentIds
            });
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["classrooms"] });
            toast({ title: "Succès", description: "Classe mise à jour avec succès" });
        },
        onError: (error: any) => {
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors de la mise à jour de la classe",
                variant: "destructive",
            });
        },
    });
};

export const useDeleteClassroom = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`/infrastructure/classrooms/${id}/`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["classrooms"] });
            toast({ title: "Succès", description: "Classe supprimée avec succès" });
        },
        onError: (error: any) => {
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors de la suppression de la classe",
                variant: "destructive",
            });
        },
    });
};

export const useAssignSubjectToClass = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({
            classId,
            subjectId,
            assign,
            isOptional,
            coefficient
        }: {
            classId: string;
            subjectId: string;
            assign: boolean;
            isOptional?: boolean;
            coefficient?: number;
        }) => {
            if (assign) {
                await apiClient.post(`/infrastructure/classrooms/${classId}/subjects/${subjectId}/`, {
                    is_optional: isOptional,
                    coefficient: coefficient
                });
            } else {
                await apiClient.delete(`/infrastructure/classrooms/${classId}/subjects/${subjectId}/`);
            }
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['class_subjects', variables.classId] });
            toast({ title: "Succès", description: "Matière mise à jour pour la classe" });
        },
        onError: (error: any) => {
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors de l'assignation de la matière",
                variant: "destructive",
            });
        },
    });
};

export const classroomQueries = {
    all: (tenantId: string) => ({
        queryKey: ['classrooms', tenantId],
        queryFn: async () => {
            const response = await apiClient.get<Classroom[]>("/infrastructure/classrooms/");
            return response.data;
        }
    }),
    subjects: (classId: string) => ({
        queryKey: ['class_subjects', classId],
        queryFn: async () => {
            const response = await apiClient.get<any[]>(`/infrastructure/classrooms/${classId}/subjects/`);
            return response.data;
        }
    }),
    enrollmentCounts: (classIds: string[]) => ({
        queryKey: ['class_enrollments', ...classIds],
        queryFn: async () => {
            if (!classIds.length) return {};
            const params = new URLSearchParams();
            classIds.forEach(id => params.append('class_ids', id));
            try {
                const response = await apiClient.get<Record<string, number>>(`/infrastructure/enrollments/counts/?${params.toString()}`);
                return response.data;
            } catch (e) {
                return {};
            }
        }
    })
};
