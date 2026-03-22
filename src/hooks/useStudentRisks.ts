import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { toast } from "sonner";

export interface StudentRiskScore {
    id: string;
    student_id: string;
    risk_score: number;
    risk_level: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
    factors: {
        category: string;
        score: number;
        weight: number;
        details: string;
    }[];
    student?: {
        first_name: string;
        last_name: string;
        photo_url?: string;
    };
    created_at: string;
}

export const useStudentRisks = (tenantId: string) => {
    const queryClient = useQueryClient();

    // Fetch risk scores — uses the sovereign analytics endpoint
    const { data: risks, isLoading } = useQuery({
        queryKey: ["student-risks", tenantId],
        queryFn: async () => {
            if (!tenantId) return [];
            const { data } = await apiClient.get("/analytics/students-at-risk");
            // Map to expected format
            return (data?.students || []).map((s: any): StudentRiskScore => ({
                id: s.student_id,
                student_id: s.student_id,
                risk_score: s.avg_grade,
                risk_level: (s.risk_level?.toUpperCase() as StudentRiskScore["risk_level"]) || "LOW",
                factors: [{ category: "Moyenne générale", score: s.avg_grade, weight: 1, details: `${s.grade_count} notes enregistrées` }],
                student: { first_name: s.first_name, last_name: s.last_name },
                created_at: new Date().toISOString(),
            }));
        },
        enabled: !!tenantId,
    });

    // Calculate/refresh risks — calls analytics endpoint
    const calculateRisks = useMutation({
        mutationFn: async (termId: string) => {
            if (!termId) throw new Error("Term ID is required");
            // Refresh analytics (already computed from DB)
            const { data } = await apiClient.get("/analytics/students-at-risk");
            return {
                processed: data?.summary?.total || 0,
                critical_alerts: data?.summary?.critical || 0,
            };
        },
        onSuccess: (data) => {
            toast.success(`${data.processed} élèves analysés, ${data.critical_alerts} alertes critiques.`);
            queryClient.invalidateQueries({ queryKey: ["student-risks", tenantId] });
        },
        onError: () => {
            toast.error("Erreur lors de l'analyse des risques");
        },
    });

    return { risks, isLoading, calculateRisks };
};
