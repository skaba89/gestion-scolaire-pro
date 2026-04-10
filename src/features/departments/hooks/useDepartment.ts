/**
 * useDepartment — Sovereign hook for the Department Portal.
 * Replaces all Supabase direct queries in department pages.
 * Single hook providing department data with specialized sub-hooks.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { toast } from "sonner";

const BASE = "/department-portal";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Department {
    id: string;
    name: string;
    code?: string;
    description?: string;
}

export interface DeptStats {
    totalStudents: number;
    totalTeachers: number;
    totalSubjects: number;
    attendanceRate: number;
    upcomingExams: number;
    pendingGrades: number;
}

export interface DeptActivity {
    type: string;
    description: string;
    time: string;
}

export interface DeptStudent {
    id: string;
    first_name: string;
    last_name: string;
    registration_number?: string;
    email?: string;
    phone?: string;
    photo_url?: string;
    classroom: { id: string; name: string };
}

export interface DeptTeacher {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    avatar_url?: string;
    subjects: string[];
    classrooms_names: string[];
    assignment_count: number;
    hours_this_month: number;
}

export interface DeptAttendanceRecord {
    id: string;
    date: string;
    status: string;
    notes?: string;
    students: { first_name: string; last_name: string; registration_number?: string };
    classrooms: { name: string };
}

export interface DeptExam {
    id: string;
    name: string;
    description?: string;
    exam_date: string;
    start_time?: string;
    end_time?: string;
    room_name?: string;
    max_score: number;
    status: string;
    class_id?: string;
    subject_id?: string;
    term_id?: string;
    classroom?: { name: string };
    subject?: { name: string };
    term?: { name: string };
}

export interface ExamFormData {
    name: string;
    description?: string;
    exam_date: string;
    start_time?: string;
    end_time?: string;
    room_name?: string;
    max_score?: number;
    status: string;
    class_id?: string;
    subject_id: string;
    term_id: string;
}


// ─── My Department (identity) ─────────────────────────────────────────────────

export const useMyDepartment = () => {
    const { data: department, isLoading, error } = useQuery<Department>({
        queryKey: ["my-department"],
        queryFn: async () => {
            const { data } = await apiClient.get(`${BASE}/my-department`);
            return data;
        },
        retry: false,
    });
    return { department, isLoading, notFound: !isLoading && !department };
};


// ─── Department Classrooms list ────────────────────────────────────────────────

export const useDepartmentClassrooms = () => {
    return useQuery({
        queryKey: ["department-classrooms-list"],
        queryFn: async () => {
            const { data } = await apiClient.get(`${BASE}/classrooms`);
            return data as Array<{
                id: string; name: string; level_id?: string;
                capacity?: number; section?: string; level_name?: string;
            }>;
        },
    });
};


// ─── Department Dashboard ─────────────────────────────────────────────────────

export const useDepartmentDashboard = () => {
    return useQuery({
        queryKey: ["department-dashboard"],
        queryFn: async () => {
            const { data } = await apiClient.get(`${BASE}/dashboard`);
            return data as {
                department: Department;
                stats: DeptStats;
                recent_activities: DeptActivity[];
            };
        },
    });
};


// ─── Department Students ──────────────────────────────────────────────────────

export const useDepartmentStudents = (classroomId?: string, search?: string) => {
    return useQuery({
        queryKey: ["department-students", classroomId, search],
        queryFn: async () => {
            const params: Record<string, string> = {};
            if (classroomId && classroomId !== "all") params.classroom_id = classroomId;
            if (search) params.search = search;
            const { data } = await apiClient.get(`${BASE}/students`, { params });
            return data as {
                students: DeptStudent[];
                classrooms: { id: string; name: string }[];
            };
        },
    });
};


// ─── Department Teachers ──────────────────────────────────────────────────────

export const useDepartmentTeachers = () => {
    return useQuery({
        queryKey: ["department-teachers"],
        queryFn: async () => {
            const { data } = await apiClient.get(`${BASE}/teachers`);
            return data as {
                department: Department;
                teachers: DeptTeacher[];
            };
        },
    });
};


// ─── Department Attendance ────────────────────────────────────────────────────

export const useDepartmentAttendance = (period: "week" | "month" = "week", classroomId?: string) => {
    return useQuery({
        queryKey: ["department-attendance", period, classroomId],
        queryFn: async () => {
            const params: Record<string, string> = { period };
            if (classroomId && classroomId !== "all") params.classroom_id = classroomId;
            const { data } = await apiClient.get(`${BASE}/attendance`, { params });
            return data as {
                department: Department;
                classrooms: { id: string; name: string }[];
                records: DeptAttendanceRecord[];
                stats: {
                    total: number; present: number; absent: number;
                    late: number; excused: number; attendance_rate: number;
                };
            };
        },
    });
};


// ─── Department Exams ─────────────────────────────────────────────────────────

export const useDepartmentExams = () => {
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: ["department-exams"],
        queryFn: async () => {
            const { data } = await apiClient.get(`${BASE}/exams`);
            return data as {
                department: Department;
                exams: DeptExam[];
                classrooms: { id: string; name: string }[];
                subjects: { id: string; name: string }[];
                terms: { id: string; name: string }[];
            };
        },
    });

    const createExam = useMutation({
        mutationFn: async (body: ExamFormData) => {
            const { data } = await apiClient.post(`${BASE}/exams`, body);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["department-exams"] });
            toast.success("Examen créé");
        },
        onError: () => toast.error("Erreur lors de la création"),
    });

    const updateExam = useMutation({
        mutationFn: async ({ id, ...body }: ExamFormData & { id: string }) => {
            const { data } = await apiClient.put(`${BASE}/exams/${id}`, body);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["department-exams"] });
            toast.success("Examen modifié");
        },
        onError: () => toast.error("Erreur lors de la modification"),
    });

    const deleteExam = useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`${BASE}/exams/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["department-exams"] });
            toast.success("Examen supprimé");
        },
        onError: () => toast.error("Erreur lors de la suppression"),
    });

    return { data, isLoading, createExam, updateExam, deleteExam };
};


// ─── Department Schedule ──────────────────────────────────────────────────────

export const useDepartmentSchedule = () => {
    return useQuery({
        queryKey: ["department-schedule"],
        queryFn: async () => {
            const { data } = await apiClient.get(`${BASE}/schedule`);
            return data as {
                department: Department;
                schedule: Array<{
                    id: string;
                    day_of_week: string;
                    start_time: string;
                    end_time: string;
                    subject: { name: string };
                    teacher: { first_name: string; last_name: string };
                    classroom: { name: string };
                }>;
            };
        },
    });
};


// ─── Department Reports (Grades) ──────────────────────────────────────────────

export const useDepartmentGradesReport = (termId?: string, classroomId?: string) => {
    return useQuery({
        queryKey: ["department-grades-report", termId, classroomId],
        queryFn: async () => {
            const params: Record<string, string> = {};
            if (termId) params.term_id = termId;
            if (classroomId && classroomId !== "all") params.classroom_id = classroomId;
            const { data } = await apiClient.get(`${BASE}/reports/grades`, { params });
            return data;
        },
    });
};
