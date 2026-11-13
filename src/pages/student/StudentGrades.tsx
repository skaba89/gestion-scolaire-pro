import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { studentQueries } from "@/queries/students";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { StudentGradeTable } from "@/components/student/StudentGradeTable";

import { useStudentData } from "@/features/students/hooks/useStudentData";
import { useTranslation } from "react-i18next";

const StudentGrades = () => {
  const { t } = useTranslation();
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
          {t("studentPortal.grades.title")}
        </h1>
        <p className="text-muted-foreground">
          {t("studentPortal.grades.subtitle")}
        </p>
      </div>

      <StudentGradeTable grades={grades || []} />
    </div>
  );
};

export default StudentGrades;
