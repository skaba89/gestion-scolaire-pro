// Shared tenant.type → landing-template classification. Previously
// duplicated only inside TenantLanding.tsx (selectTemplate) — pulled out
// so the new page-template starter kit (publicPageTemplates.ts) picks the
// exact same bundle a tenant will actually see rendered, instead of a
// second copy of this list silently drifting out of sync with the first.
export type TenantTemplateGroup = 'university' | 'highschool' | 'primary' | 'default';

const UNIVERSITY_TYPES = new Set([
  'UNIVERSITY', 'HIGHER_EDUCATION', 'INSTITUTE', 'BTS', 'IUT',
]);

const HIGH_SCHOOL_TYPES = new Set([
  'HIGH_SCHOOL', 'LYCEE', 'LYCÉE', 'SECONDARY', 'COLLÈGE', 'COLLEGE', 'SECONDARY_SCHOOL',
]);

const PRIMARY_TYPES = new Set([
  'PRIMARY', 'ELEMENTARY',
]);

export function getTenantTemplateGroup(type: string | undefined | null): TenantTemplateGroup {
  const normalized = String(type ?? '').toUpperCase();
  if (UNIVERSITY_TYPES.has(normalized)) return 'university';
  if (HIGH_SCHOOL_TYPES.has(normalized)) return 'highschool';
  if (PRIMARY_TYPES.has(normalized)) return 'primary';
  return 'default';
}
