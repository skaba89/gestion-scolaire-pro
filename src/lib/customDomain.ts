/**
 * Domaine personnalisé d'un établissement (PUBLIC-DOMAIN-01, 2026-11-25).
 *
 * Un identifiant d'établissement présent dans l'URL (« /ecole/uls », « /uls ») fait TOUJOURS foi :
 * l'URL attribuée par la plateforme fonctionne quel que soit le nom d'hôte. Auparavant, tout hôte
 * absent d'une liste codée en dur (schoolflow.pro, localhost…) était pris pour le domaine propre
 * d'une école : sur academy-guineenne.org, chaque page « /ecole/<slug> » cherchait une école par
 * domaine et affichait « Établissement introuvable ».
 *
 * Sans identifiant dans l'URL, un hôte qui n'est pas celui de la plateforme est traité comme un
 * domaine personnalisé (résolu par /tenants/by-domain/).
 */
const KNOWN_PLATFORM_HOSTS = [
  'localhost',
  '127.0.0.1',
  'schoolflow.pro',
  'app.schoolflow.pro',
  'www.schoolflow.pro',
];

// Hébergeurs (sous-domaines générés automatiquement, ex. gestion-scolaire-pro-9on3.onrender.com) :
// jamais le domaine propre d'une école.
const PLATFORM_HOSTING_SUFFIXES = ['onrender.com', 'netlify.app', 'vercel.app'];

function matches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function customDomainFor(hostname: string, tenantSlug?: string): string | undefined {
  if (tenantSlug) return undefined;
  const host = hostname.toLowerCase();
  if (!host) return undefined;
  if (KNOWN_PLATFORM_HOSTS.some((d) => matches(host, d))) return undefined;
  if (PLATFORM_HOSTING_SUFFIXES.some((d) => matches(host, d))) return undefined;
  if (host.includes('schoolflow')) return undefined;
  return host;
}
