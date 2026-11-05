/** Aggregation for the department's "students per classroom" chart. */
export interface ClassroomLabel { id: string; name: string }
export interface EnrollmentClassRef { class_id: string }
export interface ClassroomCount { name: string; count: number }

/**
 * The /enrollments/ response does not include classrooms.name.
 * Use the canonical /infrastructure/classrooms/ data to label each class.
 * Include empty classes instead of silently omitting them from the chart.
 */
export function buildDepartmentEnrollmentCounts(
  enrollments: EnrollmentClassRef[],
  departmentClassIds: string[],
  tenantClassrooms: ClassroomLabel[],
): ClassroomCount[] {
  const classroomMap = new Map(tenantClassrooms.map(({ id, name }) => [id, name]));
  const uniqueIds = [...new Set(departmentClassIds)];
  const allowed = new Set(uniqueIds);
  const counts = new Map(uniqueIds.map(id => [id, 0]));

  for (const row of enrollments) {
    if (row && allowed.has(row.class_id)) {
      counts.set(row.class_id, (counts.get(row.class_id) ?? 0) + 1);
    }
  }

  return uniqueIds.map(id => ({
    name: classroomMap.get(id) || id,
    count: counts.get(id) ?? 0,
  }));
}
