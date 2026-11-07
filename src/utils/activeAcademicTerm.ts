/** Return the current active academic term, never a term from another year. */
export interface AcademicTermChoice {
    id: string;
    academic_year_id: string;
    is_active: boolean;
}

export function selectActiveAcademicTerm<T extends AcademicTermChoice>(
    terms: readonly T[],
    academicYearId: string
): T | undefined {
    return terms.find(term =>
        term.is_active &&
        (academicYearId === "current" || term.academic_year_id === academicYearId)
    );
}
