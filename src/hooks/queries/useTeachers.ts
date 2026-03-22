import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface TeacherProfile {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    is_active: boolean | null;
}

export interface TeacherScheduleSlot {
    id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    room_name: string | null;
    classrooms: { name: string } | null;
    subjects: { name: string } | null;
}

export const useTeachers = (tenantId: string, options?: { page?: number; pageSize?: number; search?: string }) => {
    const queryClient = useQueryClient();
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 10;
    const search = options?.search || "";

    const teachersQuery = useQuery({
        queryKey: ["teachers", tenantId, page, pageSize, search],
        queryFn: async () => {
            if (!tenantId) return { teachers: [], totalCount: 0 };

            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;

            let query = supabase
                .from("profiles")
                .select(`
                    id, 
                    email, 
                    first_name, 
                    last_name, 
                    phone, 
                    is_active,
                    user_roles!inner(role, tenant_id)
                `, { count: "exact" })
                .eq("user_roles.tenant_id", tenantId)
                .eq("user_roles.role", "TEACHER");

            if (search) {
                query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);
            }

            const { data, error, count } = await query
                .order("last_name", { ascending: true })
                .range(from, to);

            if (error) throw error;
            return {
                teachers: data as unknown as TeacherProfile[],
                totalCount: count || 0
            };
        },
        enabled: !!tenantId,
    });

    const addTeacher = useMutation({
        mutationFn: async (formData: { email: string; firstName?: string; lastName?: string; phone?: string }) => {
            if (!tenantId) throw new Error("Tenant manquant");

            const { data: existingProfile, error: profileError } = await supabase
                .from("profiles")
                .select("id")
                .eq("email", formData.email)
                .maybeSingle();

            if (profileError) throw profileError;
            if (!existingProfile) {
                throw new Error("Cet utilisateur doit d'abord créer un compte.");
            }

            const { data: existingRole } = await supabase
                .from("user_roles")
                .select("id")
                .eq("user_id", existingProfile.id)
                .eq("tenant_id", tenantId)
                .eq("role", "TEACHER")
                .maybeSingle();

            if (existingRole) {
                throw new Error("Cet utilisateur est déjà enseignant");
            }

            const { error: roleError } = await supabase
                .from("user_roles")
                .insert({
                    user_id: existingProfile.id,
                    tenant_id: tenantId,
                    role: "TEACHER",
                });

            if (roleError) throw roleError;

            const { error: updateError } = await supabase
                .from("profiles")
                .update({
                    tenant_id: tenantId,
                    first_name: formData.firstName || undefined,
                    last_name: formData.lastName || undefined,
                    phone: formData.phone || undefined,
                })
                .eq("id", existingProfile.id);

            if (updateError) throw updateError;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["teachers", tenantId] });
            toast.success("Enseignant ajouté avec succès");
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });

    const deleteTeacher = useMutation({
        mutationFn: async (teacherId: string) => {
            if (!tenantId) throw new Error("Tenant manquant");

            const { error } = await supabase
                .from("user_roles")
                .delete()
                .eq("user_id", teacherId)
                .eq("tenant_id", tenantId)
                .eq("role", "TEACHER");

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["teachers", tenantId] });
            toast.success("Rôle enseignant supprimé avec succès");
        },
        onError: (error: Error) => {
            toast.error("Erreur lors de la suppression: " + error.message);
        },
    });

    return {
        teachers: teachersQuery.data?.teachers || [],
        totalCount: teachersQuery.data?.totalCount || 0,
        isLoading: teachersQuery.isLoading,
        addTeacher: addTeacher.mutateAsync,
        isAdding: addTeacher.isPending,
        deleteTeacher: deleteTeacher.mutateAsync,
        isDeleting: deleteTeacher.isPending,
    };
};

export const useTeacherDetails = (teacherId?: string) => {
    return useQuery({
        queryKey: ["teacher-schedule", teacherId],
        queryFn: async () => {
            if (!teacherId) return [];
            const { data, error } = await supabase
                .from("schedule_slots")
                .select(`
            id,
            day_of_week,
            start_time,
            end_time,
            room_name,
            classrooms (name),
            subjects (name)
          `)
                .eq("teacher_id", teacherId)
                .order("day_of_week")
                .order("start_time");
            if (error) throw error;
            return data as unknown as TeacherScheduleSlot[];
        },
        enabled: !!teacherId,
    });
};
