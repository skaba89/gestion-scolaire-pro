import { describe, expect, it } from "vitest";
import { buildDepartmentAttendanceTrends } from "../departmentAttendanceTrends";

const days = [
  { date: "2026-11-04", label: "mer." },
  { date: "2026-11-05", label: "jeu." },
];

describe("department attendance trends", () => {
  it("counts only permitted classroom records for the requested days", () => {
    const data = buildDepartmentAttendanceTrends([
      { date: "2026-11-04", classroom_id: "a", status: "PRESENT" },
      { date: "2026-11-04", classroom_id: "a", status: "ABSENT" },
      { date: "2026-11-05", classroom_id: "b", status: "LATE" },
      { date: "2026-11-05", classroom_id: "other", status: "ABSENT" },
      { date: "2026-11-03", classroom_id: "a", status: "PRESENT" },
    ], days, ["a", "b"]);
    expect(data).toEqual([
      { date: "mer.", present: 1, absent: 1, late: 0 },
      { date: "jeu.", present: 0, absent: 0, late: 1 },
    ]);
  });

  it("preserves zero-count days and ignores excused or missing classroom records", () => {
    expect(buildDepartmentAttendanceTrends([
      { date: "2026-11-05", classroom_id: "a", status: "EXCUSED" },
      { date: "2026-11-05", classroom_id: null, status: "PRESENT" },
    ], days, ["a"])).toEqual([
      { date: "mer.", present: 0, absent: 0, late: 0 },
      { date: "jeu.", present: 0, absent: 0, late: 0 },
    ]);
  });

  it("returns an empty series when no dates are requested", () => {
    expect(buildDepartmentAttendanceTrends([], [], ["a"])).toEqual([]);
  });
});
