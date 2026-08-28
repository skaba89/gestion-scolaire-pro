// Shared tenant.type → landing-template classification. Previously
// duplicated only inside TenantLanding.tsx (selectTemplate) — pulled out
// so the new page-template starter kit (publicPageTemplates.ts) picks the
// exact same bundle a tenant will actually see rendered, instead of a
// second copy of this list silently drifting out of sync with the first.
export type TenantTemplateGroup = 'university' | 'highschool' | 'primary' | 'default';

const UNIVERSITY_TYPES = new Set([
  'UNIVERSITY', 'HIGHER_EDUCATION', 'INSTITUTE', 'BTS', 'IUT',
]);

// 'HIGH' et 'MIDDLE' ajoutés le 2026-08-28 (audit templates de site public) :
// ce sont les VRAIES valeurs envoyées par tous les formulaires de création/
// édition de tenant (CreateTenant.tsx, TenantSettings.tsx,
// EstablishmentSettings.tsx, SchoolWizard.tsx — tous "school"|"primary"|
// "middle"|"high"|"university"|"training", jamais les formes longues
// ci-dessous). Sans ça, tout lycée ("high") ou collège ("middle") créé via
// l'interface standard tombait silencieusement sur le template 'default'
// au lieu de 'highschool' — le seul type qui "marchait" par coïncidence de
// nommage était 'university'/'primary'. Les formes longues restent pour
// tolérer d'éventuelles données historiques ou saisies manuelles en base.
const HIGH_SCHOOL_TYPES = new Set([
  'HIGH', 'MIDDLE',
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

// Libellés/couleurs d'affichage pour tenant.type, tenus par les VRAIES
// valeurs stockées en base (voir commentaire HIGH_SCHOOL_TYPES ci-dessus).
// Remplace les copies dupliquées et cassées de PublicDirectory.tsx et
// ConnectionHub.tsx, qui utilisaient des clés en snake_case
// ("high_school", "primary_school", "training_center") ne correspondant à
// AUCUNE valeur réellement écrite par les formulaires — seul "university"
// matchait par coïncidence.
export const TENANT_TYPE_LABELS: Record<string, string> = {
  university: 'Université',
  high: 'Lycée',
  middle: 'Collège',
  primary: 'École primaire',
  school: 'École',
  training: 'Centre de formation',
};

export function getTenantTypeLabel(type: string | undefined | null): string {
  if (!type) return 'Établissement';
  return TENANT_TYPE_LABELS[type] ?? type;
}

export const TENANT_TYPE_BADGE_COLORS: Record<string, string> = {
  university: 'bg-blue-100 text-blue-800',
  high: 'bg-purple-100 text-purple-800',
  middle: 'bg-purple-100 text-purple-800',
  primary: 'bg-green-100 text-green-800',
  school: 'bg-gray-100 text-gray-700',
  training: 'bg-orange-100 text-orange-800',
};

export function getTenantTypeBadgeColor(type: string | undefined | null): string {
  if (!type) return 'bg-gray-100 text-gray-700';
  return TENANT_TYPE_BADGE_COLORS[type] ?? 'bg-gray-100 text-gray-700';
}
