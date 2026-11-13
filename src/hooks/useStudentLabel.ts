
import { useTerminology } from "./useTerminology";
import { useCallback, useMemo } from "react";

export type StudentLabelType = "student" | "students" | "of_student" | "of_students" | "new_student";

export const useStudentLabel = () => {
    const { getLabel, isUniversity, studentLabel, studentsLabel, StudentLabel, StudentsLabel } = useTerminology();

    // Mapping legacy types to terminology keys
    const getLegacyLabel = useCallback((type: StudentLabelType = "students", capitalize = false) => {
        switch (type) {
            case "student": return getLabel("student", capitalize);
            case "students": return getLabel("students", capitalize);
            case "of_student": return getLabel("ofStudent", capitalize);
            case "of_students": return getLabel("ofStudents", capitalize);
            // Centres de formation = vocabulaire du supérieur (isHigherEd, voir
            // useTerminology) : « nouvel étudiant » et non « nouvel élève ».
            case "new_student": return getLabel("newStudent", capitalize);
            default: return getLabel("students", capitalize);
        }
    }, [getLabel]);

    return useMemo(() => ({
        getLabel: getLegacyLabel,
        isUniversity,
        studentLabel,
        studentsLabel,
        StudentLabel,
        StudentsLabel,
    }), [getLegacyLabel, isUniversity, studentLabel, studentsLabel, StudentLabel, StudentsLabel]);
};
