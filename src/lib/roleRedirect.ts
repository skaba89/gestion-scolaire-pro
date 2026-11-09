import type { AppRole } from "@/lib/types";

/**
 * Portail d'accueil d'un rôle. Source unique, utilisée après connexion
 * (TenantAuth) et lors d'un accès refusé. ALUMNI et SECRETARY étaient absents
 * de la liste : renvoyés vers « / » (page publique) au lieu de leur portail
 * (R4, recette E2E des portails).
 */
export const getRedirectPathForRoles = (roles: AppRole[], tenantSlug?: string | null): string => {
  const businessRoles = roles.filter((role) =>
    [
      "SUPER_ADMIN",
      "TENANT_ADMIN",
      "DIRECTOR",
      "DEPARTMENT_HEAD",
      "TEACHER",
      "PARENT",
      "STUDENT",
      "ALUMNI",
      "ACCOUNTANT",
      "SECRETARY",
      "STAFF",
    ].includes(role),
  );

  if (businessRoles.length === 0) {
    return "/";
  }

  // SUPER_ADMIN always goes to the platform dashboard regardless of tenant
  if (businessRoles.includes("SUPER_ADMIN" as AppRole)) {
    return "/super-admin";
  }

  const prefix = tenantSlug ? `/${tenantSlug}` : "";

  if (
    businessRoles.includes("TENANT_ADMIN") ||
    businessRoles.includes("DIRECTOR") ||
    businessRoles.includes("ACCOUNTANT") ||
    businessRoles.includes("SECRETARY" as AppRole)
  ) {
    return `${prefix}/admin`;
  }
  if (businessRoles.includes("DEPARTMENT_HEAD" as AppRole)) {
    return `${prefix}/department`;
  }
  if (businessRoles.includes("TEACHER")) {
    return `${prefix}/teacher`;
  }
  if (businessRoles.includes("PARENT")) {
    return `${prefix}/parent`;
  }
  if (businessRoles.includes("STUDENT")) {
    return `${prefix}/student`;
  }
  if (businessRoles.includes("ALUMNI" as AppRole)) {
    return `${prefix}/alumni`;
  }
  if (businessRoles.includes("STAFF")) {
    return `${prefix}/admin`;
  }

  return "/";
};
