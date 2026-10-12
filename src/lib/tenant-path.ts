/**
 * Chemin équivalent sous l'établissement de l'utilisateur, s'il ouvre l'URL
 * d'un AUTRE établissement (`/:tenantSlug/...`). Sans cela il restait sous le
 * slug de l'autre établissement, dont l'interface (nom, logo, assistant
 * d'installation) s'affichait — l'API refusait déjà toute donnée (403/404).
 * Le SUPER_ADMIN, lui, consulte légitimement n'importe quel établissement.
 */
export const ownTenantPath = (
  pathname: string,
  urlSlug: string | undefined,
  ownSlug: string | null | undefined,
  isSuperAdmin: boolean,
): string | null => {
  if (!urlSlug || !ownSlug || isSuperAdmin || urlSlug === ownSlug) return null;
  const prefix = `/${urlSlug}`;
  if (!pathname.startsWith(prefix)) return null;
  return `/${ownSlug}${pathname.slice(prefix.length)}`;
};
