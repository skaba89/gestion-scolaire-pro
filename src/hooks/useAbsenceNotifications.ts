import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { useBulkNotifications } from "@/hooks/useNotifications";

export const useAbsenceNotifications = () => {
  const { tenant } = useTenant();
  const bulkNotify = useBulkNotifications();

  const sendAbsenceNotification = useMutation({
    mutationFn: async ({
      studentId,
      studentName,
      date
    }: {
      studentId: string;
      studentName: string;
      date: string;
    }) => {
      if (!tenant?.id) return;

      // Get parents of this student
      const { data: parentStudents } = await apiClient.get<{ parent_id: string }[]>(
        `/parents/students/${studentId}/parents/`
      );

      if (!parentStudents?.length) return { notified: 0 };

      // Create notifications for all parents
      const notifications = parentStudents.map(ps => ({
        userId: ps.parent_id,
        title: "Absence signalée",
        message: `${studentName} a été marqué(e) absent(e) le ${new Date(date).toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long'
        })}`,
        type: "absence" as const,
        link: tenant.slug ? `/${tenant.slug}/parent/children` : "/parent/children",
      }));

      await bulkNotify.mutateAsync(notifications);

      return { notified: parentStudents.length };
    },
  });

  return { sendAbsenceNotification };
};
