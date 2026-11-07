import { describe, expect, it } from "vitest";
import { findPreviousAcademicTerm, type DatedAcademicTerm } from "./academicTermOrder";

const terms: DatedAcademicTerm[] = [
    { id: "previous-year", academic_year_id: "old", start_date: "2025-09-01", end_date: "2025-12-15" },
    { id: "current", academic_year_id: "year-1", start_date: "2026-03-01", end_date: "2026-06-30" },
    { id: "first", academic_year_id: "year-1", start_date: "2026-01-01", end_date: "2026-02-15" },
    { id: "future", academic_year_id: "year-1", start_date: "2026-09-01", end_date: "2026-12-15" },
    { id: "earlier", academic_year_id: "year-1", start_date: "2025-09-01", end_date: "2025-12-15" },
];

describe("findPreviousAcademicTerm", () => {
    it("selects the closest completed term even when list order is unsorted", () => {
        expect(findPreviousAcademicTerm(terms, "current")?.id).toBe("first");
    });
    it("never mixes academic years or chooses a future term", () => {
        expect(findPreviousAcademicTerm(terms, "earlier")).toBeUndefined();
        expect(findPreviousAcademicTerm(terms, "previous-year")).toBeUndefined();
    });
    it("does not compare an overlapping term", () => {
        const overlapping = { id: "overlap", academic_year_id: "year-1", start_date: "2026-02-01", end_date: "2026-03-10" };
        expect(findPreviousAcademicTerm([terms[1], overlapping], "current")).toBeUndefined();
    });
    it("handles unknown term and missing dates", () => {
        expect(findPreviousAcademicTerm(terms, "unknown")).toBeUndefined();
        expect(findPreviousAcademicTerm([{ id: "current", academic_year_id: "year-1", start_date: "", end_date: "" }], "current")).toBeUndefined();
    });
    it("does not mutate the source list", () => {
        const before = terms.map(t => t.id);
        findPreviousAcademicTerm(terms, "current");
        expect(terms.map(t => t.id)).toEqual(before);
    });
});
