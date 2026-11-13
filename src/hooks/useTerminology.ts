
import { useTenant } from "@/contexts/TenantContext";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import "@/i18n/config";

const TERMINOLOGY_KEYS = new Set([
    "term", "terms", "subject", "subjects", "level", "classroom", "student", "students",
    "teacher", "coefficient", "grade", "ofStudent", "ofStudents", "newStudent",
]);

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

    const { t, i18n } = useTranslation();

    // Vocabulaire traduit (terminology.school.* / terminology.higherEd.*) ;
    // une clé inconnue est renvoyée telle quelle, comme avant.
    const getLabel = useCallback((key: string, capitalize = false) => {
        const variant = isHigherEd ? "higherEd" : "school";
        const label = TERMINOLOGY_KEYS.has(key) ? t(`terminology.${variant}.${key}`) : key;
        if (capitalize) {
            return label.charAt(0).toUpperCase() + label.slice(1);
        }
        return label;
        // i18n.language : recalcul des libellés au changement de langue.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isHigherEd, t, i18n.language]);

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
