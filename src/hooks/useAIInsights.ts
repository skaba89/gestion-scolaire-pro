/**
 * useAIInsights — indicateurs de la page « Insights IA », lus sur les
 * endpoints d'analyse du backend.
 *
 * Règle (audit 2026-11-02, SIM-AI-01) : rien n'est inventé. Les anciennes
 * versions fabriquaient des tendances sur 6 mois par tirage aléatoire, une
 * présence de 100 % par élève, des « confiances » de 70 à 88 %, un taux de
 * réussite plancher de 60 % et des impacts chiffrés (« +25 % ») sans aucune
 * mesure. Une valeur que l'API ne fournit pas est null et s'affiche comme
 * indisponible.
 */

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTenant } from "@/contexts/TenantContext";
import { apiClient } from "@/api/client";
import type { Prediction, Recommendation, SchoolKpis, StudentRisk } from "@/types/ai";

/** Clés React Query de la page — « Actualiser » invalide exactement celles-ci. */
export const AI_INSIGHTS_QUERY_KEYS = ["students-at-risk", "academic-kpis", "operational-kpis"] as const;

interface AtRiskRow {
    student_id: string;
    first_name: string;
    last_name: string;
    avg_grade: number | null;
    grade_count: number;
    risk_level: "critical" | "high" | "moderate" | "low";
}

interface AtRiskResponse {
    students: AtRiskRow[];
    summary: { total: number; critical: number; high: number; moderate: number; low: number };
}

interface AcademicKpisResponse {
    overallSuccessRate?: number;
    totalStudents?: number;
    averageGrade?: number;
}

interface OperationalKpisResponse {
    studentAttendanceRate?: number;
}

const RISK_SCORE: Record<AtRiskRow["risk_level"], number> = { critical: 75, high: 55, moderate: 30, low: 10 };

function numberOrNull(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function useAIInsights() {
    const { tenant } = useTenant();
    const { t } = useTranslation();
    const enabled = !!tenant?.id;

    const riskQuery = useQuery({
        queryKey: ["students-at-risk", tenant?.id],
        queryFn: async () => (await apiClient.get<AtRiskResponse>("/analytics/students-at-risk/")).data,
        enabled,
    });
    const academicQuery = useQuery({
        queryKey: ["academic-kpis", tenant?.id],
        queryFn: async () => (await apiClient.get<AcademicKpisResponse>("/analytics/academic-kpis/")).data,
        enabled,
    });
    const operationalQuery = useQuery({
        queryKey: ["operational-kpis", tenant?.id],
        queryFn: async () => (await apiClient.get<OperationalKpisResponse>("/analytics/operational-kpis/")).data,
        enabled,
    });

    const studentRisks: StudentRisk[] = (riskQuery.data?.students ?? [])
        .map((s): StudentRisk => {
            const avg = Math.round((s.avg_grade ?? 0) * 10) / 10;
            const factors: string[] = [];
            if (s.grade_count === 0) factors.push(t("aiInsights.factors.noGrades"));
            else if (avg < 8) factors.push(t("aiInsights.factors.veryLowAverage"));
            else if (avg < 10) factors.push(t("aiInsights.factors.lowAverage"));
            return {
                id: s.student_id,
                name: `${s.first_name} ${s.last_name}`,
                classroom: "",
                riskLevel: s.risk_level === "critical" || s.risk_level === "high" ? "high" : s.risk_level === "moderate" ? "medium" : "low",
                riskScore: RISK_SCORE[s.risk_level] ?? 0,
                factors,
                avgGrade: avg,
                attendanceRate: null,
            };
        })
        .sort((a, b) => b.riskScore - a.riskScore);

    const kpis: SchoolKpis = {
        averageGrade: numberOrNull(academicQuery.data?.averageGrade),
        attendanceRate: numberOrNull(operationalQuery.data?.studentAttendanceRate),
        successRate: numberOrNull(academicQuery.data?.overallSuccessRate),
        totalStudents: numberOrNull(academicQuery.data?.totalStudents),
    };

    const unavailable = t("aiInsights.unavailable");
    const highRiskCount = studentRisks.filter((s) => s.riskLevel === "high").length;

    const predictions: Prediction[] = [
        {
            type: "grades",
            title: t("aiInsights.indicators.averageGrade"),
            description: t("aiInsights.indicators.averageGradeHint"),
            value: kpis.averageGrade === null ? unavailable : `${kpis.averageGrade.toFixed(1)}/20`,
        },
        {
            type: "attendance",
            title: t("aiInsights.indicators.attendance"),
            description: t("aiInsights.indicators.attendanceHint"),
            value: kpis.attendanceRate === null ? unavailable : `${Math.round(kpis.attendanceRate)} %`,
        },
        {
            type: "risk",
            title: t("aiInsights.indicators.atRisk"),
            description: t("aiInsights.indicators.atRiskHint"),
            value: riskQuery.data ? String(highRiskCount) : unavailable,
        },
        {
            type: "success",
            title: t("aiInsights.indicators.successRate"),
            description: t("aiInsights.indicators.successRateHint"),
            value: kpis.successRate === null ? unavailable : `${Math.round(kpis.successRate)} %`,
        },
    ];

    // Suggestions fondées uniquement sur les chiffres ci-dessus ; aucun
    // impact chiffré n'est promis (rien ne le mesure).
    const recommendations: Recommendation[] = [];
    if (highRiskCount > 0) {
        recommendations.push({
            id: "follow-up",
            category: t("aiInsights.recommendations.interventionCategory"),
            title: t("aiInsights.recommendations.followUpTitle"),
            description: t("aiInsights.recommendations.followUpBody", { count: highRiskCount }),
            priority: "high",
        });
    }
    if (kpis.attendanceRate !== null && kpis.attendanceRate < 80) {
        recommendations.push({
            id: "attendance",
            category: t("aiInsights.recommendations.attendanceCategory"),
            title: t("aiInsights.recommendations.attendanceTitle"),
            description: t("aiInsights.recommendations.attendanceBody", { rate: Math.round(kpis.attendanceRate) }),
            priority: "high",
        });
    }

    return {
        studentRisks,
        predictions,
        recommendations,
        kpis,
        isLoading: riskQuery.isLoading || academicQuery.isLoading || operationalQuery.isLoading,
        isError: riskQuery.isError || academicQuery.isError || operationalQuery.isError,
        classrooms: [] as { id: string; name: string }[],
    };
}
