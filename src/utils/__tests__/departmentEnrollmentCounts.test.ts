import { describe, expect, it } from "vitest";
import { buildDepartmentEnrollmentCounts, parseDepartmentEnrollmentResponse } from "../departmentEnrollmentCounts";

describe("department enrollment chart", () => {
  const classrooms = [
    { id: "a", name: "6e A" },
    { id: "b", name: "6e B" },
    { id: "c", name: "5e C" },
  ];

  it("shows classroom names from the real classroom API, not the enrollment payload", () => {
    const result = buildDepartmentEnrollmentCounts([
      { class_id: "a" },
      { class_id: "a" },
      { class_id: "c" },
    ], ["a", "b"], classrooms);
    expect(result).toEqual([
      { name: "6e A", count: 2 },
      { name: "6e B", count: 0 },
    ]);
  });

  it("never includes enrollments outside the department even if returned by the server", () => {
    expect(buildDepartmentEnrollmentCounts([
      { class_id: "c" }, { class_id: "a" }, { class_id: "b" },
    ], ["a"], classrooms)).toEqual([{ name: "6e A", count: 1 }]);
  });

  it("handles duplicate class associations and missing labels without misleading names", () => {
    expect(buildDepartmentEnrollmentCounts([
      { class_id: "a" },
    ], ["a", "a", "unknown"], classrooms)).toEqual([
      { name: "6e A", count: 1 },
      { name: "unknown", count: 0 },
    ]);
  });

  it("returns an empty series when no department classes exist", () => {
    expect(buildDepartmentEnrollmentCounts([{ class_id: "a" }], [], classrooms)).toEqual([]);
  });
  it("accepts a valid empty enrollment response as genuinely empty data", () => {
    expect(parseDepartmentEnrollmentResponse([])).toEqual([]);
    expect(buildDepartmentEnrollmentCounts(parseDepartmentEnrollmentResponse([]), ["a"], classrooms))
      .toEqual([{ name: "6e A", count: 0 }]);
  });

  it("rejects invalid API responses rather than presenting false zero enrollment", () => {
    expect(() => parseDepartmentEnrollmentResponse({ results: [] })).toThrow("Format des inscriptions inattendu");
    expect(() => parseDepartmentEnrollmentResponse(null)).toThrow("Format des inscriptions inattendu");
    expect(() => parseDepartmentEnrollmentResponse([{ student_id: "x" }])).toThrow("Format des inscriptions inattendu");
  });

  it("accepts the actual enrollment API array shape", () => {
    expect(parseDepartmentEnrollmentResponse([
      { id: "e-1", class_id: "a", student_id: "s-1" },
    ])).toEqual([{ id: "e-1", class_id: "a", student_id: "s-1" }]);
  });

});
