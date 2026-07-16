import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";

import { enqueueAction, isNetworkError } from "@/lib/offline-queue";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export interface AttendanceRecord {
    id: string;
    student_id: string;
    class_id: string | null;
    date: string;
    status: AttendanceStatus;
    recorded_by: string | null;
    tenant_id: string;
}

export interface SessionCheckIn {
    id: string;
    student_id: string;
    checked_at: string;
    students?: {
        id: string;
        first_name: string;
        last_name: string;
        registration_number: string | null;
    };
}

export const useTeacherAttendance = (classroomId?: string, date?: string) => {
    const { user } = useAuth();
    const { tenant } = useTenant();
    const queryClient = useQueryClient();

    // 1. Fetch Students for a classroom
    const studentsQuery = useQuery({
        queryKey: ["classroom-students-attendance", classroomId],
        queryFn: async () => {
            if (!classroomId) return [];
            const { data } = await apiClient.get("/enrollments/", {
                params: { class_id: classroomId, status: "active" },
            });
            return data?.results ?? data ?? [];
        },
        enabled: !!classroomId,
    });

    // 2. Fetch Attendance records
    const attendanceQuery = useQuery({
        queryKey: ["attendance-records", classroomId, date],
        queryFn: async () => {
            if (!classroomId || !date) return [];
            const { data } = await apiClient.get("/attendance/", {
                params: { class_id: classroomId, date },
            });
            return (data?.results ?? data ?? []) as AttendanceRecord[];
        },
        enabled: !!classroomId && !!date,
    });

    // 3. Save/Update Attendance Mutation (avec brouillon offline)
    const saveAttendance = useMutation({
        mutationFn: async ({
            studentId,
            status,
        }: {
            studentId: string;
            status: AttendanceStatus;
        }): Promise<{ queued: boolean }> => {
            if (!tenant?.id) throw new Error("Tenant missing");

            // Les enregistrements créés hors ligne (id "offline-…") n'existent
            // pas encore côté serveur : on repart sur un POST.
            const existingRecord = attendanceQuery.data?.find(
                a => a.student_id === studentId && !String(a.id).startsWith("offline-"),
            );

            const request = existingRecord
                ? {
                    method: "PATCH" as const,
                    url: `/attendance/${existingRecord.id}/`,
                    body: { status },
                }
                : {
                    method: "POST" as const,
                    url: "/attendance/",
                    body: {
                        student_id: studentId,
                        class_id: classroomId,
                        date: date,
                        status,
                        tenant_id: tenant.id,
                        recorded_by: user?.id,
                    },
                };

            try {
                if (request.method === "PATCH") await apiClient.patch(request.url, request.body);
                else await apiClient.post(request.url, request.body);
                return { queued: false };
            } catch (error) {
                if (!isNetworkError(error)) throw error;

                // Hors ligne : brouillon local, rejoué au retour du réseau.
                // Un second changement pour le même élève remplace le brouillon
                // précédent (dedupeKey) — c'est le dernier statut qui compte.
                enqueueAction({
                    kind: "attendance",
                    ...request,
                    dedupeKey: `attendance:${classroomId}:${date}:${studentId}`,
                    tenantId: String(tenant.id),
                    userId: user?.id ? String(user.id) : null,
                });

                // Mise à jour optimiste de l'écran de pointage.
                queryClient.setQueryData<AttendanceRecord[]>(
                    ["attendance-records", classroomId, date],
                    (records = []) => {
                        const existing = records.find(r => r.student_id === studentId);
                        if (existing) {
                            return records.map(r =>
                                r.student_id === studentId ? { ...r, status } : r,
                            );
                        }
                        return [
                            ...records,
                            {
                                id: `offline-${studentId}`,
                                student_id: studentId,
                                class_id: classroomId ?? null,
                                date: date ?? "",
                                status,
                                recorded_by: user?.id ? String(user.id) : null,
                                tenant_id: String(tenant.id),
                            },
                        ];
                    },
                );
                return { queued: true };
            }
        },
        onSuccess: ({ queued }) => {
            if (queued) {
                toast.info("Hors ligne — présence enregistrée en brouillon, synchronisation au retour du réseau.");
                return;
            }
            queryClient.invalidateQueries({ queryKey: ["attendance-records", classroomId, date] });
            toast.success("Présence enregistrée");
        },
        onError: (error: any) => {
            toast.error("Erreur lors de l'enregistrement: " + (error.response?.data?.detail || error.message));
        }
    });

    return {
        students: studentsQuery.data || [],
        attendance: attendanceQuery.data || [],
        isLoading: studentsQuery.isLoading || attendanceQuery.isLoading,
        saveAttendance: saveAttendance.mutateAsync,
        isSaving: saveAttendance.isPending,
    };
};

export const useClassSessions = (classroomId?: string, subjectId?: string) => {
    const { tenant } = useTenant();
    const queryClient = useQueryClient();

    const activeSessionQuery = useQuery({
        queryKey: ['active-session', classroomId, subjectId],
        queryFn: async () => {
            if (!classroomId || !subjectId || !tenant?.id) return null;
            const today = new Date().toISOString().split('T')[0];
            const { data } = await apiClient.get("/class-sessions/", {
                params: {
                    class_id: classroomId,
                    subject_id: subjectId,
                    session_date: today,
                    status: 'active',
                },
            });
            // Returns first result or null
            const results = data?.results ?? data ?? [];
            return results.length > 0 ? results[0] : null;
        },
        enabled: !!classroomId && !!subjectId && !!tenant?.id,
    });

    return {
        activeSession: activeSessionQuery.data,
        isLoading: activeSessionQuery.isLoading,
        refetchSession: activeSessionQuery.refetch,
    };
};
