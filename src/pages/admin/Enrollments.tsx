import { useTranslation } from "react-i18next";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { EnrollmentManager } from "@/components/enrollments/EnrollmentManager";

const Enrollments = () => {
  const { t } = useTranslation();
  const { studentsLabel } = useStudentLabel();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("enrollments.pageTitle")}</h1>
        <p className="text-muted-foreground">{t("enrollments.pageSubtitle", { students: studentsLabel })}</p>
      </div>

      <EnrollmentManager />
    </div>
  );
};

export default Enrollments;
