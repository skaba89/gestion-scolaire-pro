import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { studentQueries } from "@/queries/students";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { StudentGradeTable } from "@/components/student/StudentGradeTable";

import { useStudentData } from "@/features/students/hooks/useStudentData";

const StudentGrades = () => {
  const { user } = useAuth();
  const { tenant } = useTenant();

  const { grades, isLoading } = useStudentData();

  if (isLoading) {
    return <TableSkeleton columns={5} rows={10} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">
          Mes Notes
        </h1>
        <p className="text-muted-foreground">
          Consultez vos résultats scolaires
        </p>
      </div>

      <StudentGradeTable grades={grades || []} />
    </div>
  );
};

export default StudentGrades;
