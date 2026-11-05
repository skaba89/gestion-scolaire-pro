/** A classroom/department association as returned by infrastructure API. */
export interface ClassroomDepartmentAssociation {
  class_id: string;
  department_id: string;
}

/**
 * The API returns all associations for the current tenant, not just the requested
 * department. Keep only that department's associations; never trust client query
 * parameters that the API does not implement.
 */
export function filterDepartmentClassrooms(
  response: unknown,
  departmentId: string
): ClassroomDepartmentAssociation[] {
  if (!departmentId || !Array.isArray(response)) return [];
  return response.filter(
    (entry): entry is ClassroomDepartmentAssociation =>
      !!entry &&
      typeof entry === 'object' &&
      typeof entry.class_id === 'string' &&
      typeof entry.department_id === 'string' &&
      entry.department_id === departmentId
  );
}
