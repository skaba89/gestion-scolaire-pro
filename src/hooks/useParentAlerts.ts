/**
 * useParentAlerts — Sovereign replacement for Supabase Edge Function 'send-parent-alert'.
 * Inserts notifications directly via the API notifications endpoint.
 */
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";

interface AbsenceAlertParams {
  studentId: string;
  studentName: string;
  date: string;
}

interface GradeAlertParams {
  studentId: string;
  studentName: string;
  subjectName: string;
  assessmentName: string;
  score: number;
  maxScore: number;
}

export const useParentAlerts = () => {
  const { tenant } = useTenant();

  const sendAbsenceAlert = useMutation({
    mutationFn: async (params: AbsenceAlertParams) => {
      if (!tenant?.id) return;
      // Send a notification via the sovereign notifications endpoint
      await apiClient.post("/notifications/send-parent-alert/", {
        type: "absence",
        student_id: params.studentId,
        student_name: params.studentName,
        tenant_id: tenant.id,
        details: { date: params.date },
      }).catch(() => {
        // Silently fail — non-blocking
        console.warn("Parent absence alert could not be sent via API");
      });
    },
  });

  const sendLowGradeAlert = useMutation({
    mutationFn: async (params: GradeAlertParams) => {
      if (!tenant?.id) return;
      const percentage = params.score / params.maxScore;
      if (percentage >= 0.5) return; // Only alert below 50%

      await apiClient.post("/notifications/send-parent-alert/", {
        type: "low_grade",
        student_id: params.studentId,
        student_name: params.studentName,
        tenant_id: tenant.id,
        details: {
          subject_name: params.subjectName,
          assessment_name: params.assessmentName,
          score: params.score,
          max_score: params.maxScore,
        },
      }).catch(() => {
        console.warn("Parent grade alert could not be sent via API");
      });
    },
  });

  return { sendAbsenceAlert, sendLowGradeAlert };
};
