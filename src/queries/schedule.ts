import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { toast } from "sonner";

export interface ScheduleSlot {
    id: string;
    tenant_id: string;
    class_id: string;
    subject_id: string;
    teacher_id: string | null;
    day_of_week: number;
    start_time: string;
    end_time: string;
    room_id: string | null;
    created_at?: string;
    subject?: { name: string } | null;
    room?: { name: string } | null;
    teacher?: { first_name: string; last_name: string } | null;
    classrooms?: { name: string } | null;
}

export const scheduleQueries = {
    byClass: (tenantId: string, classroomId: string) => ({
        queryKey: ["schedule", tenantId, classroomId],
        queryFn: async () => {
            if (!tenantId || !classroomId || classroomId === "none") return [];
            const response = await apiClient.get<ScheduleSlot[]>("/schedule/", {
                params: { class_id: classroomId }
            });
            return response.data;
        },
        enabled: !!tenantId && !!classroomId && classroomId !== "none",
    }),
};

export const useCreateScheduleSlot = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (slot: Omit<ScheduleSlot, "id" | "created_at">) => {
            const response = await apiClient.post<ScheduleSlot>("/schedule/", slot);
            return response.data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["schedule", data.tenant_id, data.class_id] });
            toast.success("Créneau ajouté avec succès");
        },
        onError: (error: any) => {
            toast.error("Erreur lors de l'ajout : " + error.message);
        },
    });
};

export const useDeleteScheduleSlot = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, tenantId, classId }: { id: string, tenantId: string, classId: string }) => {
            await apiClient.delete(`/schedule/${id}/`);
            return { tenantId, classId };
        },
        onSuccess: (variables) => {
            queryClient.invalidateQueries({ queryKey: ["schedule", variables.tenantId, variables.classId] });
            toast.success("Créneau supprimé");
        },
        onError: (error: any) => {
            toast.error("Erreur lors de la suppression : " + error.message);
        },
    });
};
