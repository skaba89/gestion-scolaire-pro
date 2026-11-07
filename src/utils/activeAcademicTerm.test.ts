import { describe, expect, it } from "vitest";
import { selectActiveAcademicTerm } from "./activeAcademicTerm";

const terms = [
    { id: "inactive", academic_year_id: "year-1", is_active: false },
    { id: "old-active", academic_year_id: "year-0", is_active: true },
    { id: "current-active", academic_year_id: "year-1", is_active: true },
];

describe("selectActiveAcademicTerm", () => {
    it("selects only an active term in the requested academic year", () => {
        expect(selectActiveAcademicTerm(terms, "year-1")?.id).toBe("current-active");
    });

    it("never chooses an inactive term", () => {
        expect(selectActiveAcademicTerm([terms[0]], "year-1")).toBeUndefined();
    });

    it("does not leak a term from another academic year", () => {
        expect(selectActiveAcademicTerm(terms, "year-2")).toBeUndefined();
    });

    it("supports the missing-current-year fallback", () => {
        expect(selectActiveAcademicTerm(terms, "current")?.id).toBe("old-active");
    });

    it("handles an empty list", () => {
        expect(selectActiveAcademicTerm([], "year-1")).toBeUndefined();
    });
});
