import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
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
      const { data: student } = await apiClient.get<{
        user_id: string;
        first_name: string;
        last_name: string;
      }>(`/students/${params.studentId}/`);

      const notifications: Array<{
        user_id: string;
        tenant_id: string;
        title: string;
        message: string;
        type: string;
        link: string;
      }> = [];

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
      const { data: parentLinks } = await apiClient.get<{ parent_id: string }[]>(
        `/parents/students/${params.studentId}/parents/`
      );

      if (parentLinks) {
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

      const allNotifications: Array<{
        user_id: string;
        tenant_id: string;
        title: string;
        message: string;
        type: string;
        link: string;
      }> = [];

      for (const grade of grades) {
        // Get student info
        const { data: student } = await apiClient.get<{
          user_id: string;
          first_name: string;
          last_name: string;
        }>(`/students/${grade.studentId}/`);

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
        const { data: parentLinks } = await apiClient.get<{ parent_id: string }[]>(
          `/parents/students/${grade.studentId}/parents/`
        );

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
