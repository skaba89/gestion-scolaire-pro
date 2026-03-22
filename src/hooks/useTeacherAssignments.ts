import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

      const { data, error } = await supabase
        .from("teacher_assignments")
        .select(`
          id,
          class_id,
          subject_id,
          classrooms:class_id (id, name),
          subjects:subject_id (id, name)
        `)
        .eq("teacher_id", user.id)
        .eq("tenant_id", tenant.id);

      if (error) throw error;

      return data?.map(a => ({
        id: a.id,
        class_id: a.class_id,
        subject_id: a.subject_id,
        classroom: a.classrooms as any,
        subject: a.subjects as any,
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
