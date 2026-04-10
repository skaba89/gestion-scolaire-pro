import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";

export interface TeacherAssignment {
  id: string;
  class_id: string;
  subject_id: string;
  classroom: {
    id: string;
    name: string;
  };
  subject: {
    id: string;
    name: string;
  };
}

export const useTeacherAssignments = () => {
  const { user } = useAuth();
  const { tenant } = useTenant();

  const { data: assignments, isLoading } = useQuery({
    queryKey: ["teacher-assignments", user?.id, tenant?.id],
    queryFn: async () => {
      if (!user?.id || !tenant?.id) return [];

      const { data } = await apiClient.get<TeacherAssignment[]>("/teachers/dashboard/", {
        params: { include_assignments: true },
      });

      return (data ?? []).map(a => ({
        id: a.id,
        class_id: a.class_id,
        subject_id: a.subject_id,
        classroom: a.classroom,
        subject: a.subject,
      })) as TeacherAssignment[];
    },
    enabled: !!user?.id && !!tenant?.id,
  });

  // Get unique classrooms from assignments
  const assignedClassrooms = assignments?.reduce((acc, curr) => {
    if (!acc.find(c => c.id === curr.class_id)) {
      acc.push(curr.classroom);
    }
    return acc;
  }, [] as { id: string; name: string }[]) || [];

  // Get unique subjects from assignments
  const assignedSubjects = assignments?.reduce((acc, curr) => {
    if (!acc.find(s => s.id === curr.subject_id)) {
      acc.push(curr.subject);
    }
    return acc;
  }, [] as { id: string; name: string }[]) || [];

  // Get subjects for a specific classroom
  const getSubjectsForClassroom = (classroomId: string) => {
    return assignments
      ?.filter(a => a.class_id === classroomId)
      .map(a => a.subject) || [];
  };

  // Check if teacher has any assignments
  const hasAssignments = (assignments?.length || 0) > 0;

  return {
    assignments,
    assignedClassrooms,
    assignedSubjects,
    getSubjectsForClassroom,
    hasAssignments,
    isLoading,
  };
};
