import { describe, expect, it } from "vitest";
import { filterDepartmentClassrooms } from "../departmentClassrooms";

describe("department classroom associations", () => {
  const associations = [
    { class_id: "class-a", department_id: "dept-1" },
    { class_id: "class-b", department_id: "dept-2" },
    { class_id: "class-c", department_id: "dept-1" },
  ];

  it("returns only classrooms belonging to the requested department", () => {
    expect(filterDepartmentClassrooms(associations, "dept-1")).toEqual([
      associations[0],
      associations[2],
    ]);
  });

  it("excludes entries without valid association identifiers", () => {
    expect(filterDepartmentClassrooms([
      ...associations,
      null,
      { class_id: "class-x" },
      { class_id: 12, department_id: "dept-1" },
    ], "dept-1")).toEqual([associations[0], associations[2]]);
  });

  it("returns an empty list for missing department or invalid server data", () => {
    expect(filterDepartmentClassrooms(associations, "")).toEqual([]);
    expect(filterDepartmentClassrooms({ data: associations }, "dept-1")).toEqual([]);
    expect(filterDepartmentClassrooms(null, "dept-1")).toEqual([]);
  });
});
