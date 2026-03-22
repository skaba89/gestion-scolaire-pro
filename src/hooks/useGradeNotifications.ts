import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useBulkNotifications } from "@/hooks/useNotifications";

interface NotifyGradeParams {
  studentId: string;
  assessmentName: string;
  subjectName: string;
  score: number;
  maxScore: number;
}

export const useGradeNotifications = () => {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const bulkNotify = useBulkNotifications();

  const notifyGrade = useMutation({
    mutationFn: async (params: NotifyGradeParams) => {
      if (!tenant?.id) throw new Error("No tenant");

      // Get student to find their user_id
      const { data: student, error: studentError } = await supabase
        .from("students")
        .select("user_id, first_name, last_name")
        .eq("id", params.studentId)
        .single();

      if (studentError) throw studentError;

      const notifications = [];

      // Notify the student if they have a user account
      if (student?.user_id) {
        notifications.push({
          user_id: student.user_id,
          tenant_id: tenant.id,
          title: "Nouvelle note disponible",
          message: `${params.subjectName}: ${params.score}/${params.maxScore} - ${params.assessmentName}`,
          type: "grade",
          link: tenant.slug ? `/${tenant.slug}/student/grades` : "/student/grades",
        });
      }

      // Find parents of the student
      const { data: parentLinks, error: parentError } = await supabase
        .from("parent_students")
        .select("parent_id")
        .eq("student_id", params.studentId);

      if (!parentError && parentLinks) {
        for (const link of parentLinks) {
          notifications.push({
            user_id: link.parent_id,
            tenant_id: tenant.id,
            title: `Nouvelle note pour ${student.first_name}`,
            message: `${params.subjectName}: ${params.score}/${params.maxScore} - ${params.assessmentName}`,
            type: "grade",
            link: tenant.slug ? `/${tenant.slug}/parent/children` : "/parent/children",
          });
        }
      }

      // Insert all notifications
      if (notifications.length > 0) {
        await bulkNotify.mutateAsync(notifications.map(n => ({
          userId: n.user_id,
          title: n.title,
          message: n.message,
          type: n.type as any,
          link: n.link
        })));
      }

      return { notificationsSent: notifications.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const notifyBulkGrades = useMutation({
    mutationFn: async (grades: NotifyGradeParams[]) => {
      if (!tenant?.id) throw new Error("No tenant");

      const allNotifications: any[] = [];

      for (const grade of grades) {
        // Get student info
        const { data: student } = await supabase
          .from("students")
          .select("user_id, first_name, last_name")
          .eq("id", grade.studentId)
          .single();

        if (student?.user_id) {
          allNotifications.push({
            user_id: student.user_id,
            tenant_id: tenant.id,
            title: "Nouvelle note disponible",
            message: `${grade.subjectName}: ${grade.score}/${grade.maxScore} - ${grade.assessmentName}`,
            type: "grade",
            link: tenant.slug ? `/${tenant.slug}/student/grades` : "/student/grades",
          });
        }

        // Find parents
        const { data: parentLinks } = await supabase
          .from("parent_students")
          .select("parent_id")
          .eq("student_id", grade.studentId);

        if (parentLinks) {
          for (const link of parentLinks) {
            allNotifications.push({
              user_id: link.parent_id,
              tenant_id: tenant.id,
              title: `Nouvelle note pour ${student?.first_name}`,
              message: `${grade.subjectName}: ${grade.score}/${grade.maxScore} - ${grade.assessmentName}`,
              type: "grade",
              link: tenant.slug ? `/${tenant.slug}/parent/children` : "/parent/children",
            });
          }
        }
      }

      if (allNotifications.length > 0) {
        await bulkNotify.mutateAsync(allNotifications.map(n => ({
          userId: n.user_id,
          title: n.title,
          message: n.message,
          type: n.type as any,
          link: n.link
        })));
      }

      return { notificationsSent: allNotifications.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  return { notifyGrade, notifyBulkGrades };
};
