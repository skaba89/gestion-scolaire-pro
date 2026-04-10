import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { format, subMonths, differenceInDays } from "date-fns";
import { fr } from "date-fns/locale";
import {
    TrendingUp,
    TrendingDown,
    BookOpen,
    Calendar,
    AlertTriangle,
    Star
} from "lucide-react";

export interface ParentAnalyticsData {
    gradesByMonth: any[];
    subjectPerformance: any[];
    attendanceByMonth: any[];
    assessmentTypeDistribution: any[];
    pointsByCategory: any[];
    overallStats: {
        overallAverage: number;
        attendanceRate: number;
        homeworkCompletionRate: number;
        trend: number;
        totalPoints: number;
        achievementsCount: number;
        rareAchievementsCount: number;
    };
    recommendations: any[];
    homeworkTimingData: any[];
    homeworkData: any[];
    achievements: any[];
}

export const useParentAnalytics = (studentId: string, tenantId: string) => {
    // Fetch student grades over time
    const { data: gradesData = [] } = useQuery({
        queryKey: ["student_grades_analytics", studentId],
        queryFn: async () => {
            const { data } = await apiClient.get<any[]>("/grades/", {
                params: { student_id: studentId, ordering: "created_at" },
            });
            return data || [];
        }
    });

    // Fetch attendance data
    const { data: attendanceData = [] } = useQuery({
        queryKey: ["student_attendance_analytics", studentId],
        queryFn: async () => {
            const sixMonthsAgo = subMonths(new Date(), 6);
            const { data } = await apiClient.get<any[]>("/attendance/", {
                params: { student_id: studentId, date_gte: sixMonthsAgo.toISOString(), ordering: "date" },
            });
            return data || [];
        }
    });

    // Fetch homework submissions
    const { data: homeworkDataRaw = [] } = useQuery({
        queryKey: ["student_homework_analytics", studentId],
        queryFn: async () => {
            const { data } = await apiClient.get<any[]>("/homework-submissions/", {
                params: { student_id: studentId, ordering: "-submitted_at", limit: 30 },
            });
            return data || [];
        }
    });

    // Fetch student achievements
    const { data: achievements = [] } = useQuery({
        queryKey: ["student_achievements", studentId],
        queryFn: async () => {
            const { data } = await apiClient.get<any[]>("/student-achievements/", {
                params: { student_id: studentId, ordering: "-earned_at" },
            });
            return data || [];
        }
    });

    // Fetch student points
    const { data: pointsData = [] } = useQuery({
        queryKey: ["student_points_summary", studentId],
        queryFn: async () => {
            try {
                const { data } = await apiClient.get<any[]>("/student-achievements/", {
                    params: { student_id: studentId },
                });
                return data?.map(d => ({
                    points: (d.achievement as any)?.points_reward || 0,
                    category: "Achievement"
                })) || [];
            } catch {
                return [];
            }
        }
    });

    // Transformations
    const gradesByMonth = gradesData.reduce((acc: any[], grade: any) => {
        if (!grade.created_at || grade.score === null) return acc;
        const month = format(new Date(grade.created_at), "MMM yyyy", { locale: fr });
        const maxScore = grade.assessment?.max_score || 20;
        const normalizedScore = (grade.score / maxScore) * 20;

        const existing = acc.find(m => m.month === month);
        if (existing) {
            existing.total += normalizedScore;
            existing.count++;
            existing.average = existing.total / existing.count;
        } else {
            acc.push({ month, total: normalizedScore, count: 1, average: normalizedScore });
        }
        return acc;
    }, []);

    const subjectPerformance = gradesData.reduce((acc: any[], grade: any) => {
        if (!grade.assessment?.subject?.name || grade.score === null) return acc;
        const subject = grade.assessment.subject.name;
        const maxScore = grade.assessment?.max_score || 20;
        const normalizedScore = (grade.score / maxScore) * 20;

        const existing = acc.find(s => s.subject === subject);
        if (existing) {
            existing.total += normalizedScore;
            existing.count++;
            existing.score = existing.total / existing.count;
        } else {
            acc.push({ subject, total: normalizedScore, count: 1, score: normalizedScore, fullMark: 20 });
        }
        return acc;
    }, []);

    const attendanceByMonth = attendanceData.reduce((acc: any[], att: any) => {
        const month = format(new Date(att.date), "MMM", { locale: fr });
        const existing = acc.find(m => m.month === month);
        const status = att.status?.toUpperCase();
        if (existing) {
            existing.total++;
            if (status === "PRESENT") existing.present++;
            existing.rate = Math.round((existing.present / existing.total) * 100);
        } else {
            acc.push({
                month,
                total: 1,
                present: status === "PRESENT" ? 1 : 0,
                rate: status === "PRESENT" ? 100 : 0
            });
        }
        return acc;
    }, []);

    const assessmentTypeDistribution = gradesData.reduce((acc: any[], grade: any) => {
        const type = grade.assessment?.type || "Autre";
        const existing = acc.find(t => t.name === type);
        if (existing) {
            existing.value++;
        } else {
            acc.push({ name: type, value: 1 });
        }
        return acc;
    }, []);

    const pointsByCategory = pointsData.reduce((acc: any[], point: any) => {
        const category = point.category || "Autre";
        const existing = acc.find(c => c.name === category);
        if (existing) {
            existing.value += point.points;
        } else {
            acc.push({ name: category, value: point.points });
        }
        return acc;
    }, []);

    const overallAverage = gradesByMonth.length > 0
        ? gradesByMonth.reduce((sum, m) => sum + m.average, 0) / gradesByMonth.length
        : 0;

    const attendanceRate = attendanceData.length > 0
        ? Math.round((attendanceData.filter(a => a.status?.toUpperCase() === "PRESENT").length / attendanceData.length) * 100)
        : 0;

    const homeworkCompletionRate = homeworkDataRaw.length > 0
        ? Math.round((homeworkDataRaw.filter(h => h.submitted_at).length / homeworkDataRaw.length) * 100)
        : 0;

    const trend = gradesByMonth.length >= 2
        ? gradesByMonth[gradesByMonth.length - 1].average - gradesByMonth[gradesByMonth.length - 2].average
        : 0;

    const totalPoints = pointsData.reduce((sum, p) => sum + (p.points || 0), 0);

    const recommendations = [];
    const weakSubjects = subjectPerformance.filter(s => s.score < 10);
    if (weakSubjects.length > 0) {
        recommendations.push({
            type: "warning",
            icon: AlertTriangle,
            title: "Matières à renforcer",
            message: `Attention portée sur : ${weakSubjects.map(s => s.subject).join(", ")}. Des séances de révision supplémentaires sont recommandées.`,
        });
    }
    const strongSubjects = subjectPerformance.filter(s => s.score >= 16);
    if (strongSubjects.length > 0) {
        recommendations.push({
            type: "success",
            icon: Star,
            title: "Points forts identifiés",
            message: `Excellence en ${strongSubjects.map(s => s.subject).join(", ")}. Encouragez à maintenir cet effort !`,
        });
    }
    if (attendanceRate < 90) {
        recommendations.push({
            type: "warning",
            icon: Calendar,
            title: "Assiduité à améliorer",
            message: `Le taux de présence de ${attendanceRate}% est inférieur à l'objectif de 90%. La régularité est clé pour la réussite.`,
        });
    }
    if (homeworkCompletionRate < 80) {
        recommendations.push({
            type: "warning",
            icon: BookOpen,
            title: "Devoirs à rendre",
            message: `${100 - homeworkCompletionRate}% des devoirs ne sont pas rendus. Établir un planning de travail peut aider.`,
        });
    }
    if (trend > 2) {
        recommendations.push({
            type: "success",
            icon: TrendingUp,
            title: "Progression remarquable",
            message: `Amélioration de ${trend.toFixed(1)} points ce mois ! Continuez à encourager ces efforts.`,
        });
    } else if (trend < -2) {
        recommendations.push({
            type: "warning",
            icon: TrendingDown,
            title: "Baisse de performance",
            message: `Une baisse de ${Math.abs(trend).toFixed(1)} points a été observée. Un point avec l'enseignant pourrait être utile.`,
        });
    }

    const homeworkTiming = homeworkDataRaw.reduce((acc: any, hw: any) => {
        if (!hw.submitted_at || !hw.homework?.due_date) return acc;
        const daysBeforeDue = differenceInDays(new Date(hw.homework.due_date), new Date(hw.submitted_at));
        if (daysBeforeDue >= 2) acc.early++;
        else if (daysBeforeDue >= 0) acc.onTime++;
        else acc.late++;
        return acc;
    }, { early: 0, onTime: 0, late: 0 });

    const homeworkTimingData = [
        { name: "En avance", value: homeworkTiming.early, color: "hsl(var(--success))" },
        { name: "À temps", value: homeworkTiming.onTime, color: "hsl(var(--primary))" },
        { name: "En retard", value: homeworkTiming.late, color: "hsl(var(--destructive))" },
    ].filter(d => d.value > 0);

    return {
        gradesByMonth,
        subjectPerformance,
        attendanceByMonth,
        assessmentTypeDistribution,
        pointsByCategory,
        overallStats: {
            overallAverage,
            attendanceRate,
            homeworkCompletionRate,
            trend,
            totalPoints,
            achievementsCount: achievements.length,
            rareAchievementsCount: achievements.filter(a => a.achievement?.rarity === "rare" || a.achievement?.rarity === "legendary").length
        },
        recommendations,
        homeworkTimingData,
        homeworkData: homeworkDataRaw,
        achievements
    };
};
