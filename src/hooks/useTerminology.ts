
import { useTenant } from "@/contexts/TenantContext";
import { useCallback, useMemo } from "react";

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
    // Terminology fix (2026-09): isTraining was computed above but never
    // actually used in getLabel() below — every case only checked
    // isUniversity, so a training center ("centre de formation") silently
    // got K-12 vocabulary (élève, trimestre, matière...) instead of
    // higher-ed vocabulary. A training center is no more a school than a
    // university is (isSchool above already treats them the same way) —
    // align getLabel with that same distinction.
    const isHigherEd = isUniversity || isTraining;

    const getLabel = useCallback((key: string, capitalize = false) => {
        let label = "";

        switch (key) {
            case "term":
                label = isHigherEd ? "semestre" : "trimestre";
                break;
            case "terms":
                label = isHigherEd ? "semestres" : "trimestres";
                break;
            case "subject":
                label = isHigherEd ? "unité d'enseignement (UE)" : "matière";
                break;
            case "subjects":
                label = isHigherEd ? "modules / UE" : "matières";
                break;
            case "level":
                label = isHigherEd ? "niveau / année" : "niveau";
                break;
            case "classroom":
                label = isHigherEd ? "groupe / amphi" : "classe";
                break;
            case "student":
                label = isHigherEd ? "étudiant" : "élève";
                break;
            case "students":
                label = isHigherEd ? "étudiants" : "élèves";
                break;
            case "teacher":
                label = "enseignant";
                break;
            case "coefficient":
                label = isHigherEd ? "crédits (ECTS)" : "coefficient";
                break;
            case "grade":
                label = "note";
                break;
            default:
                label = key;
        }

        if (capitalize) {
            return label.charAt(0).toUpperCase() + label.slice(1);
        }
        return label;
    }, [isHigherEd]);

    return useMemo(() => ({
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
        isHigherEd,
        isTraining,
        isSchool,
        institutionType: tenant?.type || 'school'
    }), [getLabel, isUniversity, isHigherEd, isTraining, tenant?.type]);
};
