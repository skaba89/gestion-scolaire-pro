import { useStudentLabel } from "@/hooks/useStudentLabel";
import { EnrollmentManager } from "@/components/enrollments/EnrollmentManager";

const Enrollments = () => {
  const { studentsLabel } = useStudentLabel();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Inscriptions aux Classes</h1>
        <p className="text-muted-foreground">Gérer les affectations des {studentsLabel} dans les classes</p>
      </div>

      <EnrollmentManager />
    </div>
  );
};

export default Enrollments;
