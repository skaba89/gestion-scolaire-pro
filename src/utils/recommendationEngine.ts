import { StudentRiskProfile, RiskLevel } from "./riskAssessment";
import { apiClient } from "@/api/client";
import {
    AlertTriangle,
    TrendingDown,
    Calendar,
    BookOpen,
    Users,
    MessageSquare,
    CheckCircle,
    Target
} from "lucide-react";

export interface Recommendation {
    id: string;
    type: "success" | "warning" | "danger" | "info";
    icon: any;
    title: string;
    message: string;
    action?: {
        label: string;
        url?: string;
        handler?: () => void;
    };
    priority: number; // 1-5, 5 being highest
}

/**
 * Recommendation Engine for generating personalized suggestions
 */
export const recommendationEngine = {
    /**
     * Generate recommendations for parents
     */
    async generateParentRecommendations(
        studentId: string,
        riskProfile: StudentRiskProfile
    ): Promise<Recommendation[]> {
        const recommendations: Recommendation[] = [];

        // Get student name
        let studentName = "votre enfant";
        try {
            const { data: student } = await apiClient.get(`/students/${studentId}/`);
            if (student) {
                studentName = student.first_name;
            }
        } catch {
            // fallback name already set
        }

        // Critical risk
        if (riskProfile.risk_level === "CRITICAL") {
            recommendations.push({
                id: "critical-alert",
                type: "danger",
                icon: AlertTriangle,
                title: "Intervention urgente requise",
                message: `${studentName} présente des difficultés importantes. Nous vous recommandons de prendre rendez-vous avec l'équipe pédagogique dans les plus brefs délais.`,
                action: {
                    label: "Contacter l'école",
                    url: "/parent/messages"
                },
                priority: 5
            });
        }

        // Academic risk
        const academicFactor = riskProfile.factors.find(f => f.category === "Academic Performance");
        if (academicFactor && academicFactor.score > 40) {
            const details = academicFactor.details;
            recommendations.push({
                id: "academic-support",
                type: "warning",
                icon: BookOpen,
                title: "Soutien scolaire recommandé",
                message: `Les résultats de ${studentName} nécessitent une attention particulière (${details}). Envisagez un accompagnement personnalisé ou des cours de soutien.`,
                action: {
                    label: "Voir les notes",
                    url: "/parent/grades"
                },
                priority: 4
            });
        }

        // Attendance risk
        const attendanceFactor = riskProfile.factors.find(f => f.category === "Attendance");
        if (attendanceFactor && attendanceFactor.score > 30) {
            recommendations.push({
                id: "attendance-concern",
                type: "warning",
                icon: Calendar,
                title: "Assiduité à améliorer",
                message: `${studentName} a accumulé un nombre important d'absences. L'assiduité est essentielle à la réussite scolaire.`,
                action: {
                    label: "Consulter l'historique",
                    url: "/parent/attendance"
                },
                priority: 3
            });
        }

        // Declining trend
        const trendFactor = riskProfile.factors.find(f => f.category === "Recent Trend");
        if (trendFactor && trendFactor.score > 40) {
            recommendations.push({
                id: "declining-trend",
                type: "warning",
                icon: TrendingDown,
                title: "Baisse de performance détectée",
                message: `Les notes de ${studentName} sont en baisse ces dernières semaines. Un suivi rapproché est conseillé.`,
                priority: 3
            });
        }

        // Positive feedback for low risk
        if (riskProfile.risk_level === "LOW") {
            recommendations.push({
                id: "positive-feedback",
                type: "success",
                icon: CheckCircle,
                title: "Excellent parcours !",
                message: `${studentName} maintient de bons résultats et une assiduité régulière. Continuez à l'encourager !`,
                priority: 1
            });
        }

        return recommendations.sort((a, b) => b.priority - a.priority);
    },

    /**
     * Generate recommendations for teachers
     */
    async generateTeacherRecommendations(
        classId: string,
        riskProfiles: StudentRiskProfile[]
    ): Promise<Recommendation[]> {
        const recommendations: Recommendation[] = [];

        // Count students by risk level
        const criticalCount = riskProfiles.filter(p => p.risk_level === "CRITICAL").length;
        const highCount = riskProfiles.filter(p => p.risk_level === "HIGH").length;
        const moderateCount = riskProfiles.filter(p => p.risk_level === "MODERATE").length;

        // Critical students alert
        if (criticalCount > 0) {
            recommendations.push({
                id: "critical-students",
                type: "danger",
                icon: AlertTriangle,
                title: `${criticalCount} élève(s) en situation critique`,
                message: "Ces élèves nécessitent une intervention immédiate. Planifiez des entretiens individuels et contactez les parents.",
                action: {
                    label: "Voir la liste",
                    url: `/teacher/students?risk=critical`
                },
                priority: 5
            });
        }

        // High risk students
        if (highCount > 0) {
            recommendations.push({
                id: "high-risk-students",
                type: "warning",
                icon: Users,
                title: `${highCount} élève(s) à risque élevé`,
                message: "Envisagez un plan de soutien personnalisé pour ces élèves.",
                action: {
                    label: "Voir les détails",
                    url: `/teacher/students?risk=high`
                },
                priority: 4
            });
        }

        // Class-wide attendance issue
        const avgAttendanceRisk = riskProfiles.reduce((sum, p) => {
            const factor = p.factors.find(f => f.category === "Attendance");
            return sum + (factor?.score || 0);
        }, 0) / riskProfiles.length;

        if (avgAttendanceRisk > 25) {
            recommendations.push({
                id: "class-attendance",
                type: "warning",
                icon: Calendar,
                title: "Problème d'assiduité collectif",
                message: "Le taux d'absence de la classe est préoccupant. Une action collective pourrait être nécessaire.",
                priority: 3
            });
        }

        // Positive class performance
        const lowRiskCount = riskProfiles.filter(p => p.risk_level === "LOW").length;
        const lowRiskPercentage = (lowRiskCount / riskProfiles.length) * 100;

        if (lowRiskPercentage > 70) {
            recommendations.push({
                id: "class-success",
                type: "success",
                icon: CheckCircle,
                title: "Excellents résultats de classe",
                message: `${lowRiskPercentage.toFixed(0)}% de vos élèves ont un profil à faible risque. Continuez ce bon travail !`,
                priority: 1
            });
        }

        return recommendations.sort((a, b) => b.priority - a.priority);
    },

    /**
     * Generate recommendations for school direction
     */
    async generateDirectionRecommendations(
        tenantId: string,
        termId: string
    ): Promise<Recommendation[]> {
        const recommendations: Recommendation[] = [];

        // Get all classes
        const { data: classes } = await apiClient.get("/students/", {
            params: {
                view: 'classes',
            },
        });

        if (!classes) return recommendations;

        // Aggregate risk data across all classes
        let totalStudents = 0;
        let criticalCount = 0;
        let highCount = 0;

        for (const classItem of classes) {
            const { data: enrollments } = await apiClient.get("/students/", {
                params: {
                    class_id: classItem.id,
                    status: 'active',
                },
            });

            if (enrollments) {
                totalStudents += enrollments.length;

                // Get risk scores for this class
                const { data: riskScores } = await apiClient.get("/analytics/students-at-risk/", {
                    params: {
                        class_ids: classItem.id,
                        term_id: termId,
                    },
                });

                if (riskScores) {
                    criticalCount += riskScores.filter((r: any) => r.risk_level === "CRITICAL").length;
                    highCount += riskScores.filter((r: any) => r.risk_level === "HIGH").length;
                }
            }
        }

        const criticalPercentage = (criticalCount / totalStudents) * 100;
        const atRiskPercentage = ((criticalCount + highCount) / totalStudents) * 100;

        // Critical threshold alert
        if (criticalPercentage > 5) {
            recommendations.push({
                id: "institution-critical",
                type: "danger",
                icon: AlertTriangle,
                title: "Taux critique élevé",
                message: `${criticalPercentage.toFixed(1)}% des élèves sont en situation critique. Une réunion pédagogique d'urgence est recommandée.`,
                priority: 5
            });
        }

        // At-risk threshold
        if (atRiskPercentage > 15) {
            recommendations.push({
                id: "institution-at-risk",
                type: "warning",
                icon: Target,
                title: "Taux de risque préoccupant",
                message: `${atRiskPercentage.toFixed(1)}% des élèves nécessitent une attention particulière. Envisagez des mesures de soutien institutionnelles.`,
                priority: 4
            });
        }

        // Positive institutional performance
        if (atRiskPercentage < 10) {
            recommendations.push({
                id: "institution-success",
                type: "success",
                icon: CheckCircle,
                title: "Performance institutionnelle excellente",
                message: `Moins de ${atRiskPercentage.toFixed(1)}% des élèves présentent un risque élevé. Les stratégies pédagogiques actuelles sont efficaces.`,
                priority: 1
            });
        }

        return recommendations.sort((a, b) => b.priority - a.priority);
    },

    /**
     * Generate actionable insights from risk profile
     */
    generateActionableInsights(riskProfile: StudentRiskProfile): string[] {
        const insights: string[] = [];

        riskProfile.factors.forEach(factor => {
            if (factor.score > 50) {
                switch (factor.category) {
                    case "Academic Performance":
                        insights.push("Proposer un tutorat individuel ou en petit groupe");
                        insights.push("Identifier les matières spécifiques en difficulté");
                        break;
                    case "Attendance":
                        insights.push("Contacter les parents pour comprendre les causes d'absence");
                        insights.push("Mettre en place un suivi d'assiduité hebdomadaire");
                        break;
                    case "Recent Trend":
                        insights.push("Organiser un entretien pour identifier les obstacles");
                        insights.push("Adapter les méthodes pédagogiques si nécessaire");
                        break;
                }
            }
        });

        return insights;
    }
};
