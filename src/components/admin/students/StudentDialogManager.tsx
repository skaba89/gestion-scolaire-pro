import { StudentFormDialog } from "@/components/students/StudentFormDialog";
import { QuickEnrollmentDialog } from "@/components/students/QuickEnrollmentDialog";
import { Student } from "@/queries/students";
import { useQueryClient } from "@tanstack/react-query";

interface StudentDialogManagerProps {
    isFormDialogOpen: boolean;
    setIsFormDialogOpen: (open: boolean) => void;
    editingStudent: Student | null;
    setEditingStudent: (student: Student | null) => void;
    enrollStudent: Student | null;
    setEnrollStudent: (student: Student | null) => void;
    tenantId?: string;
}

export const StudentDialogManager = ({
    isFormDialogOpen,
    setIsFormDialogOpen,
    editingStudent,
    setEditingStudent,
    enrollStudent,
    setEnrollStudent,
    tenantId,
}: StudentDialogManagerProps) => {
    const queryClient = useQueryClient();

    const handleSuccess = () => {
        queryClient.invalidateQueries({ queryKey: ["students"] });
    };

    return (
        <>
            <StudentFormDialog
                open={isFormDialogOpen}
                onOpenChange={(open) => {
                    setIsFormDialogOpen(open);
                    if (!open) setEditingStudent(null);
                }}
                onSuccess={handleSuccess}
                editStudent={editingStudent}
            />

            {enrollStudent && (
                <QuickEnrollmentDialog
                    studentId={enrollStudent.id}
                    studentName={`${enrollStudent.first_name} ${enrollStudent.last_name}`}
                    tenantId={tenantId || ""}
                    onSuccess={() => {
                        handleSuccess();
                        setEnrollStudent(null);
                    }}
                    trigger={null}
                />
            )}
        </>
    );
};
