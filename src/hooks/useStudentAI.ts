import { useState } from "react";
import { apiClient } from "@/api/client";
import { toast } from "sonner";
import { Student } from "@/queries/students";

interface UseStudentAIOptions {
    tenantId?: string;
    students?: Student[];
    studentsLabel: string;
    studentLabel: string;
}

interface AtRiskStudent {
    student_id: string;
    first_name: string;
    last_name: string;
    avg_grade: number;
    grade_count: number;
    risk_level: string;
}

export const useStudentAI = ({ tenantId, students, studentsLabel, studentLabel }: UseStudentAIOptions) => {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiAnalysisResults, setAiAnalysisResults] = useState<string[]>([]);

    const handleAIAnalysis = async () => {
        if (!tenantId || !students) return;
        setIsAnalyzing(true);
        toast.info("Analyse des données en cours...");
        try {
            const { data } = await apiClient.get("/analytics/students-at-risk/");
            const atRiskStudents: AtRiskStudent[] = data?.students || [];

            const studentIds = new Set(students.map(s => s.id));
            const highRiskIds = atRiskStudents
                .filter(s => studentIds.has(s.student_id) && (s.risk_level === 'critical' || s.risk_level === 'high'))
                .map(s => s.student_id);

            setAiAnalysisResults(highRiskIds);
            if (highRiskIds.length > 0) {
                toast.warning(`${highRiskIds.length} ${studentsLabel} identifiés à risque.`);
            } else {
                toast.success(`Aucun ${studentLabel} à risque détecté.`);
            }
        } catch (error) {
            toast.error("Erreur lors de l'analyse");
            console.error("AI Analysis error:", error);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const clearResults = () => setAiAnalysisResults([]);

    return {
        isAnalyzing,
        aiAnalysisResults,
        handleAIAnalysis,
        clearResults
    };
};
