import { useState } from "react";
import { useTeacherData } from "@/features/staff/hooks/useStaff";
import { useGrades } from "@/features/grades/hooks/useGrades";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, BarChart3, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/ui/TableSkeleton";

// Modular Components
import { TeacherGradeHeader } from "@/components/teacher/TeacherGradeHeader";
import { TeacherGradeFilters } from "@/components/teacher/TeacherGradeFilters";
import { TeacherGradeTable } from "@/components/teacher/TeacherGradeTable";
import { TeacherAssessmentDialog } from "@/components/teacher/TeacherAssessmentDialog";

const TeacherGrades = () => {
  const {
    assignedClassrooms,
    getSubjectsForClassroom,
    hasAssignments,
    isLoading: dataLoading
  } = useTeacherData();
  const { StudentLabel, studentsLabel } = useStudentLabel();

  const [selectedClassroom, setSelectedClassroom] = useState<string>("");
  const [selectedAssessment, setSelectedAssessment] = useState<string>("");
  const [isNewAssessmentOpen, setIsNewAssessmentOpen] = useState(false);

  const {
    terms,
    assessments,
    grades,
    students,
    isLoading: gradesLoading,
    createAssessment,
    isCreatingAssessment: isCreating,
    upsertGrade: saveGrade,
    isUpdatingGrade: isSaving,
  } = useGrades({ classId: selectedClassroom, assessmentId: selectedAssessment } as any);

  const isLoading = dataLoading || (selectedClassroom && gradesLoading);
  const selectedAssessmentData = assessments?.find(a => a.id === selectedAssessment);

  const handleCreateAssessment = async (data: any) => {
    await createAssessment({
      ...data,
      max_score: parseFloat(data.max_score),
      weight: parseFloat(data.weight),
      date: new Date().toISOString().split('T')[0],
    });
    setIsNewAssessmentOpen(false);
  };

  const handleSaveGrade = async (studentId: string, score: number) => {
    if (isNaN(score)) return;
    await saveGrade({
      student_id: studentId,
      assessment_id: selectedAssessment,
      score,
    });
  };

  return (
    <div className="space-y-6">
      <TeacherGradeHeader onNewAssessmentClick={() => setIsNewAssessmentOpen(true)} />

      {/* No assignments warning */}
      {!dataLoading && !hasAssignments && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <p className="text-amber-800 font-medium">
              Information : Vous n'avez pas encore d'assignations de classes. Contactez l'administration pour configurer vos droits.
            </p>
          </CardContent>
        </Card>
      )}

      <TeacherGradeFilters
        selectedClassroom={selectedClassroom}
        onClassroomChange={(v) => {
          setSelectedClassroom(v);
          setSelectedAssessment("");
        }}
        selectedAssessment={selectedAssessment}
        onAssessmentChange={setSelectedAssessment}
        assignedClassrooms={assignedClassrooms}
        assessments={assessments}
      />

      {isLoading ? (
        <TableSkeleton columns={4} rows={10} />
      ) : (
        <>
          {selectedAssessment ? (
            <TeacherGradeTable
              assessment={selectedAssessmentData}
              students={students}
              grades={grades}
              onSaveGrade={handleSaveGrade}
              isSaving={isSaving}
              studentLabel={StudentLabel}
            />
          ) : (
            <Card className="border-dashed border-2 py-16 bg-muted/5">
              <CardContent className="text-center">
                <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center mx-auto mb-4">
                  <BarChart3 className="w-8 h-8 text-primary/30" />
                </div>
                <h3 className="text-xl font-semibold text-foreground">Saisie des notes</h3>
                <p className="text-muted-foreground mt-2 max-w-xs mx-auto">
                  Veuillez sélectionner une classe et une évaluation dans les filtres ci-dessus pour commencer à saisir les notes des {studentsLabel}.
                </p>
                {selectedClassroom && (
                  <Button
                    variant="outline"
                    className="mt-6 border-dashed border-primary/30 hover:bg-primary/5 hover:border-primary/60 transition-all"
                    onClick={() => setIsNewAssessmentOpen(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Créer une nouvelle évaluation
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <TeacherAssessmentDialog
        open={isNewAssessmentOpen}
        onOpenChange={setIsNewAssessmentOpen}
        onSubmit={handleCreateAssessment}
        isPending={isCreating}
        assignedClassrooms={assignedClassrooms}
        getSubjectsForClassroom={getSubjectsForClassroom}
        terms={terms}
      />
    </div>
  );
};

export default TeacherGrades;
