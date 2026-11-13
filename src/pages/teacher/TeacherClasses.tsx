import { useQuery } from "@tanstack/react-query";
import { useTeacherData } from "@/features/staff/hooks/useStaff";
import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { useTenantUrl } from "@/hooks/useTenantUrl";
import { StaggerContainer, StaggerItem } from "@/components/ui/stagger-container";
import { classroomQueries } from "@/queries/classrooms";

// Modular Components
import { TeacherClassCard } from "@/components/teacher/TeacherClassCard";
import { useTranslation } from "react-i18next";

const TeacherClasses = () => {
  const { t } = useTranslation();
  const { assignedClassrooms, isLoading: assignmentsLoading } = useTeacherData();
  const { studentsLabel } = useStudentLabel();
  const { getTenantUrl } = useTenantUrl();

  // Get student counts per classroom
  const { data: enrollmentCounts, isLoading: countsLoading } = useQuery({
    ...classroomQueries.enrollmentCounts(assignedClassrooms?.map(c => c.id) || []),
    enabled: !!assignedClassrooms?.length,
  });

  const isLoading = assignmentsLoading || (assignedClassrooms.length > 0 && countsLoading);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{t("teacherPortal.classes.title")}</h1>
        <p className="text-muted-foreground">{t("teacherPortal.classes.subtitle", { label: studentsLabel })}</p>
      </div>

      {/* Classes Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse bg-muted h-48" />
          ))}
        </div>
      ) : !assignedClassrooms || assignedClassrooms.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <p className="font-medium">{t("teacherPortal.classes.none")}</p>
            <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
              {t("teacherPortal.classes.noneHint", { label: studentsLabel })}
            </p>
          </CardContent>
        </Card>
      ) : (
        <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {assignedClassrooms?.map((classroom, idx) => (
            <StaggerItem key={classroom.id} index={idx}>
              <TeacherClassCard
                classroom={classroom}
                studentCount={enrollmentCounts?.[classroom.id] || 0}
                studentsLabel={studentsLabel}
                getTenantUrl={getTenantUrl}
              />
            </StaggerItem>
          ))}
        </StaggerContainer>
      )}
    </div>
  );
};

export default TeacherClasses;
