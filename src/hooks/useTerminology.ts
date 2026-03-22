
import { useTenant } from "@/contexts/TenantContext";
import { useCallback } from "react";

export type InstitutionType = 'primary' | 'middle' | 'high' | 'university' | 'training' | 'school' | string;

export const useTerminology = () => {
    const { tenant } = useTenant();

    // Robust detection of University / Higher Ed
    const isUniversity = (() => {
        const type = (tenant?.type || "").toUpperCase().trim();
        return [
            'UNIVERSITY', 'UNIVERSITÉ', 'UNIVERSITE',
            'HIGHER_EDUCATION', 'ENSEIGNEMENT_SUPERIEUR', 'ENSEIGNEMENT SUPERIEUR',
            'FACULTE', 'FACULTÉ', 'INSTITUT', 'ECOLE_SUPERIEURE', 'ÉCOLE_SUPÉRIEURE',
            'BTS', 'IUT'
        ].includes(type);
    })();

    const isTraining = (tenant?.type || "").toLowerCase() === 'training';
    const isSchool = !isUniversity && !isTraining;

    const getLabel = useCallback((key: string, capitalize = false) => {
        let label = "";

        switch (key) {
            case "term":
                label = isUniversity ? "semestre" : "trimestre";
                break;
            case "terms":
                label = isUniversity ? "semestres" : "trimestres";
                break;
            case "subject":
                label = isUniversity ? "unité d'enseignement (UE)" : "matière";
                break;
            case "subjects":
                label = isUniversity ? "modules / UE" : "matières";
                break;
            case "level":
                label = isUniversity ? "niveau / année" : "niveau";
                break;
            case "classroom":
                label = isUniversity ? "groupe / amphi" : "classe";
                break;
            case "student":
                label = isUniversity ? "étudiant" : "élève";
                break;
            case "students":
                label = isUniversity ? "étudiants" : "élèves";
                break;
            case "teacher":
                label = isUniversity ? "enseignant" : "enseignant";
                break;
            case "coefficient":
                label = isUniversity ? "crédits (ECTS)" : "coefficient";
                break;
            case "grade":
                label = isUniversity ? "note" : "note";
                break;
            default:
                label = key;
        }

        if (capitalize) {
            return label.charAt(0).toUpperCase() + label.slice(1);
        }
        return label;
    }, [isUniversity, isTraining]);

    return {
        getLabel,
        // Academic Structure
        termLabel: getLabel("term", true),
        termsLabel: getLabel("terms", true),
        subjectLabel: getLabel("subject", true),
        subjectsLabel: getLabel("subjects", true),
        levelLabel: getLabel("level", true),
        classroomLabel: getLabel("classroom", true),

        // Roles & People
        studentLabel: getLabel("student"),
        studentsLabel: getLabel("students"),
        StudentLabel: getLabel("student", true),
        StudentsLabel: getLabel("students", true),
        teacherLabel: getLabel("teacher"),
        TeacherLabel: getLabel("teacher", true),

        // Evaluation
        coefficientLabel: getLabel("coefficient", true),
        gradeLabel: getLabel("grade", true),

        // Helper checks
        isUniversity,
        isTraining,
        isSchool,
        institutionType: tenant?.type || 'school'
    };
};
