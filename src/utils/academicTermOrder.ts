/** Academic-term comparison must use the requested term, not array position.
 * Only completed earlier terms from the same academic year are comparable.
 */
export interface DatedAcademicTerm {
    id: string;
    academic_year_id: string;
    start_date: string;
    end_date: string;
    sequence_number?: number;
}

export function findPreviousAcademicTerm<T extends DatedAcademicTerm>(
    terms: readonly T[],
    currentTermId: string
): T | undefined {
    const current = terms.find(t => t.id === currentTermId);
    if (!current || !current.academic_year_id || !current.start_date) return undefined;
    const earlier = terms.filter(t =>
        t.id !== current.id &&
        t.academic_year_id === current.academic_year_id &&
        !!t.start_date && !!t.end_date &&
        t.end_date < current.start_date
    );
    return earlier.sort((a, b) =>
        b.end_date.localeCompare(a.end_date) ||
        b.start_date.localeCompare(a.start_date) ||
        b.id.localeCompare(a.id)
    )[0];
}
