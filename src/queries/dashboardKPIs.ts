import { apiClient } from "@/api/client";

export interface FinancialKPIs {
    totalRevenue: number;
    paidRevenue: number;
    pendingRevenue: number;
    collectionRate: number;
    outstandingByClass: Array<{
        class_id: string;
        class_name: string;
        outstanding_amount: number;
    }>;
}

export interface RevenueDataPoint {
    period: string;
    revenue: number;
    paid: number;
    pending: number;
}

export interface AcademicKPIs {
    overallSuccessRate: number;
    totalStudents: number;
    passingStudents: number;
    failingStudents: number;
    averageGrade: number;
}

export interface SuccessRateByClass {
    class_id: string;
    class_name: string;
    success_rate: number;
    total_students: number;
}

export interface SuccessRateBySubject {
    subject_id: string;
    subject_name: string;
    success_rate: number;
    average_grade: number;
}

export interface GradeEvolutionPoint {
    period: string;
    average_grade: number;
    total_grades: number;
}

export interface TeacherWorkload {
    teacher_id: string;
    teacher_name: string;
    total_hours: number;
    subject_count: number;
}

export interface OperationalKPIs {
    studentAttendanceRate: number;
    teacherAttendanceRate: number;
    totalEnrollments: number;
    dropoutRate: number;
    dropoutCount: number;
    totalTeacherHours: number;
}

export interface AttendanceTrendPoint {
    period: string;
    attendance_rate: number;
}

export interface EnrollmentByClass {
    class_id: string;
    class_name: string;
    enrollment_count: number;
}

// ─── Financial KPIs ──────────────────────────────────────────────────────────

export const financialKPIs = {
    revenue: async (
        _tenantId: string,
        startDate?: string,
        endDate?: string
    ): Promise<FinancialKPIs> => {
        const params: Record<string, string> = {};
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;
        const { data } = await apiClient.get('/analytics/financial-kpis/', { params });
        return data as FinancialKPIs;
    },

    collectionRate: async (_tenantId: string): Promise<number> => {
        const { data } = await apiClient.get('/analytics/financial-kpis/');
        return (data as FinancialKPIs).collectionRate;
    },

    outstandingByClass: async (
        _tenantId: string
    ): Promise<Array<{ class_id: string; class_name: string; outstanding_amount: number }>> => {
        const { data } = await apiClient.get('/analytics/financial-kpis/');
        return (data as FinancialKPIs).outstandingByClass;
    },

    revenueTrend: async (_tenantId: string, months = 6): Promise<RevenueDataPoint[]> => {
        const { data } = await apiClient.get('/analytics/revenue-trend/', {
            params: { months },
        });
        return data as RevenueDataPoint[];
    },
};

// ─── Academic KPIs ───────────────────────────────────────────────────────────

export const academicKPIs = {
    overallSuccessRate: async (
        _tenantId: string,
        academicYearId: string
    ): Promise<AcademicKPIs> => {
        const params: Record<string, string> = {};
        if (academicYearId) params.academic_year_id = academicYearId;
        const { data } = await apiClient.get('/analytics/academic-kpis/', { params });
        return data as AcademicKPIs;
    },

    successRateByClass: async (
        _tenantId: string,
        academicYearId: string
    ): Promise<SuccessRateByClass[]> => {
        const params: Record<string, string> = {};
        if (academicYearId) params.academic_year_id = academicYearId;
        const { data } = await apiClient.get('/analytics/academic-stats/', { params });
        return (data as { byClass: SuccessRateByClass[] }).byClass;
    },

    successRateBySubject: async (
        _tenantId: string,
        academicYearId: string
    ): Promise<SuccessRateBySubject[]> => {
        const params: Record<string, string> = {};
        if (academicYearId) params.academic_year_id = academicYearId;
        const { data } = await apiClient.get('/analytics/academic-stats/', { params });
        return (data as { bySubject: SuccessRateBySubject[] }).bySubject;
    },

    gradeEvolution: async (
        _tenantId: string,
        academicYearId: string
    ): Promise<GradeEvolutionPoint[]> => {
        // Grade evolution is now part of academic-stats or could be a dedicated endpoint.
        // For now, return an empty array as a safe fallback (can be extended backend-side).
        return [];
    },
};

// ─── Operational KPIs ────────────────────────────────────────────────────────

export const operationalKPIs = {
    studentAttendanceRate: async (
        _tenantId: string,
        startDate?: string,
        endDate?: string
    ): Promise<number> => {
        const params: Record<string, string> = {};
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;
        const { data } = await apiClient.get('/analytics/operational-kpis/', { params });
        return (data as OperationalKPIs).studentAttendanceRate;
    },

    teacherAttendanceRate: async (
        _tenantId: string,
        startDate?: string,
        endDate?: string
    ): Promise<number> => {
        const params: Record<string, string> = {};
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;
        const { data } = await apiClient.get('/analytics/operational-kpis/', { params });
        return (data as OperationalKPIs).teacherAttendanceRate;
    },

    teacherWorkload: async (
        _tenantId: string,
        _startDate?: string,
        _endDate?: string
    ): Promise<TeacherWorkload[]> => {
        // Placeholder — extend backend /analytics/operational-kpis if needed
        return [];
    },

    enrollmentByClass: async (
        _tenantId: string,
        academicYearId: string
    ): Promise<EnrollmentByClass[]> => {
        const params: Record<string, string> = {};
        if (academicYearId) params.academic_year_id = academicYearId;
        const { data } = await apiClient.get('/analytics/operational-kpis/', { params });
        return [];
    },

    dropoutRate: async (
        _tenantId: string,
        academicYearId: string
    ): Promise<OperationalKPIs> => {
        const params: Record<string, string> = {};
        if (academicYearId) params.academic_year_id = academicYearId;
        const { data } = await apiClient.get('/analytics/operational-kpis/', { params });
        return data as OperationalKPIs;
    },

    attendanceTrend: async (
        _tenantId: string,
        _months = 6
    ): Promise<AttendanceTrendPoint[]> => {
        // Can be extended on the backend side
        return [];
    },
};
