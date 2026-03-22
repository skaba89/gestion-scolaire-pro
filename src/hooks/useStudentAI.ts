import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Student } from "@/queries/students";

interface UseStudentAIOptions {
    tenantId?: string;
    students?: Student[];
    studentsLabel: string;
    studentLabel: string;
}

interface GradeEntry {
    student_id: string;
    score: number;
    assessments: {
        max_score: number;
    } | null;
}

interface AttendanceEntry {
    student_id: string;
    status: string;
}

export const useStudentAI = ({ tenantId, students, studentsLabel, studentLabel }: UseStudentAIOptions) => {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiAnalysisResults, setAiAnalysisResults] = useState<string[]>([]);

    const handleAIAnalysis = async () => {
        if (!tenantId || !students) return;
        setIsAnalyzing(true);
        toast.info("Analyse des données en cours...");
        try {
            const [gradesRes, attendanceRes] = await Promise.all([
                supabase.from("grades").select("student_id, score, assessments(max_score)").eq("tenant_id", tenantId),
                supabase.from("attendance").select("student_id, status").eq("tenant_id", tenantId)
            ]);

            const grades = (gradesRes.data as unknown as GradeEntry[]) || [];
            const attendance = (attendanceRes.data as unknown as AttendanceEntry[]) || [];
            const highRiskIds: string[] = [];

            students.forEach(student => {
                const studentGrades = grades.filter((g) => g.student_id === student.id);
                const studentAttendance = attendance.filter((a) => a.student_id === student.id);

                let avg = 10;
                if (studentGrades.length > 0) {
                    const totalInfo = studentGrades.reduce((acc, curr) => {
                        const max = curr.assessments?.max_score || 20;
                        return { sum: acc.sum + (curr.score / max) * 20, count: acc.count + 1 };
                    }, { sum: 0, count: 0 });
                    avg = totalInfo.sum / totalInfo.count;
                }

                let attendanceRate = 100;
                if (studentAttendance.length > 0) {
                    const present = studentAttendance.filter((a) =>
                        a.status.toUpperCase() === 'PRESENT'
                    ).length;
                    attendanceRate = (present / studentAttendance.length) * 100;
                }

                if (avg < 8 || attendanceRate < 70) highRiskIds.push(student.id);
            });

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
