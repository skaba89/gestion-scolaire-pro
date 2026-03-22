import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useToast } from "@/hooks/use-toast";

export interface AcademicYear {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    is_current: boolean;
    code: string;
    tenant_id: string;
}

export const academicYearQueries = {
    all: (tenantId: string) => ({
        queryKey: ["academic-years", tenantId] as const,
        queryFn: async () => {
            const response = await apiClient.get<AcademicYear[]>("/academic-years/");
            return response.data;
        },
    }),
};

export const useCreateAcademicYear = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (year: Omit<AcademicYear, "id">) => {
            const response = await apiClient.post<AcademicYear>("/academic-years/", year);
            return response.data;
        },
        onMutate: async (newYear) => {
            await queryClient.cancelQueries({ queryKey: ["academic-years", newYear.tenant_id] });
            const previousYears = queryClient.getQueryData<AcademicYear[]>(["academic-years", newYear.tenant_id]);

            if (previousYears) {
                let updatedPrevious = previousYears;
                if (newYear.is_current) {
                    updatedPrevious = previousYears.map(y => ({ ...y, is_current: false }));
                }
                queryClient.setQueryData<AcademicYear[]>(["academic-years", newYear.tenant_id], [
                    { ...newYear, id: Math.random().toString() } as AcademicYear,
                    ...updatedPrevious,
                ].sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()));
            }

            return { previousYears };
        },
        onError: (error: any, newYear, context) => {
            if (context?.previousYears) {
                queryClient.setQueryData(["academic-years", newYear.tenant_id], context.previousYears);
            }
            const message = typeof error.response?.data?.detail === 'string' 
                ? error.response.data.detail 
                : Array.isArray(error.response?.data?.detail)
                    ? error.response.data.detail.map((d: any) => d.msg).join(", ")
                    : "Erreur lors de la création de l'année scolaire";
            toast({
                title: "Erreur",
                description: message,
                variant: "destructive",
            });
        },
        onSuccess: () => {
            toast({ title: "Succès", description: "Année scolaire créée avec succès" });
        },
        onSettled: (data, error, variables) => {
            queryClient.invalidateQueries({ queryKey: ["academic-years", variables.tenant_id] });
        },
    });
};

export const useUpdateAcademicYear = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ id, ...updates }: Partial<AcademicYear> & { id: string }) => {
            const response = await apiClient.put<AcademicYear>(`/academic-years/${id}/`, updates);
            return response.data;
        },
        onMutate: async (updatedYear) => {
            const queries = queryClient.getQueryCache().findAll({ queryKey: ["academic-years"] });
            const tenantId = queries[0]?.queryKey[1] as string;

            await queryClient.cancelQueries({ queryKey: ["academic-years", tenantId] });
            const previousYears = queryClient.getQueryData<AcademicYear[]>(["academic-years", tenantId]);

            if (previousYears) {
                let nextYears = previousYears.map(y =>
                    y.id === updatedYear.id ? { ...y, ...updatedYear } : y
                );

                if (updatedYear.is_current) {
                    nextYears = nextYears.map(y =>
                        y.id !== updatedYear.id ? { ...y, is_current: false } : y
                    );
                }

                queryClient.setQueryData<AcademicYear[]>(["academic-years", tenantId], nextYears);
            }

            return { previousYears, tenantId };
        },
        onError: (error: any, variables, context) => {
            if (context?.previousYears) {
                queryClient.setQueryData(["academic-years", context.tenantId], context.previousYears);
            }
            const message = typeof error.response?.data?.detail === 'string' 
                ? error.response.data.detail 
                : Array.isArray(error.response?.data?.detail)
                    ? error.response.data.detail.map((d: any) => d.msg).join(", ")
                    : "Erreur lors de la mise à jour de l'année scolaire";
            toast({
                title: "Erreur",
                description: message,
                variant: "destructive",
            });
        },
        onSuccess: () => {
            toast({ title: "Succès", description: "Année scolaire mise à jour avec succès" });
        },
        onSettled: (data, error, variables, context) => {
            queryClient.invalidateQueries({ queryKey: ["academic-years", context?.tenantId] });
        },
    });
};

export const useDeleteAcademicYear = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`/academic-years/${id}/`);
        },
        onMutate: async (id) => {
            const queries = queryClient.getQueryCache().findAll({ queryKey: ["academic-years"] });
            const tenantId = queries[0]?.queryKey[1] as string;

            await queryClient.cancelQueries({ queryKey: ["academic-years", tenantId] });
            const previousYears = queryClient.getQueryData<AcademicYear[]>(["academic-years", tenantId]);

            if (previousYears) {
                queryClient.setQueryData<AcademicYear[]>(["academic-years", tenantId],
                    previousYears.filter(y => y.id !== id)
                );
            }

            return { previousYears, tenantId };
        },
        onError: (error: any, id, context) => {
            if (context?.previousYears) {
                queryClient.setQueryData(["academic-years", context.tenantId], context.previousYears);
            }
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors de la suppression de l'année scolaire",
                variant: "destructive",
            });
        },
        onSuccess: () => {
            toast({ title: "Succès", description: "Année scolaire supprimée avec succès" });
        },
        onSettled: (data, error, id, context) => {
            queryClient.invalidateQueries({ queryKey: ["academic-years", context?.tenantId] });
        },
    });
};
