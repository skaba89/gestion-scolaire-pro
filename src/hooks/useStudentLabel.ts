
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
            case "of_student": return capitalize ? "De l'élève/étudiant" : "de l'élève/étudiant"; // Simplified for compatibility
            case "of_students": return capitalize ? "Des élèves/étudiants" : "des élèves/étudiants";
            case "new_student": return capitalize ? (isUniversity ? "Nouvel étudiant" : "Nouvel élève") : (isUniversity ? "nouvel étudiant" : "nouvel élève");
            default: return getLabel("students", capitalize);
        }
    }, [getLabel, isUniversity]);

    return useMemo(() => ({
        getLabel: getLegacyLabel,
        isUniversity,
        studentLabel,
        studentsLabel,
        StudentLabel,
        StudentsLabel,
    }), [getLegacyLabel, isUniversity, studentLabel, studentsLabel, StudentLabel, StudentsLabel]);
};
