import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type ConsoleMessage, type Page, type Response } from '@playwright/test';
import { API, api, credentials, stateFile, ulsUrl, type UlsRole } from './helpers';

/**
 * Parcours 9 — recette des portails par rôle (B7).
 *
 * Chaque compte de recette se connecte (session de global-setup), ouvre son
 * portail, puis CHAQUE lien de son menu latéral. Une page est en défaut si :
 * - elle affiche la page 404 du frontend ou une erreur d'affichage ;
 * - elle renvoie vers la connexion ou hors du portail ;
 * - un appel API qu'elle déclenche répond 5xx (« api-5xx ») ou 404/405,
 *   c.-à-d. une route appelée qui n'existe pas (« api-404 ») ;
 * - un appel API est refusé alors que la page figure dans le menu du rôle
 *   (« api-403 ») ou rejeté comme invalide (« api-422 ») ;
 * - la console affiche une erreur (React, exception non interceptée) ;
 * - la page affiche un texte anormal (undefined, NaN, Invalid Date,
 *   [object Object]) ou une clé de traduction brute (« raw-i18n »).
 *
 * Clés : « <page> <défaut> » pour l'affichage, « api-<code> <MÉTHODE> <route> »
 * pour l'API (une fois par rôle).
 *
 * Cliquet : role-portals.baseline.json liste les défauts connus. Tout défaut
 * absent de la liste fait échouer le test ; toute entrée de la liste qui ne
 * se reproduit plus aussi (pour la retirer et ne pas masquer une régression).
 * Le rapport complet est joint au test (role-portals-<rôle>.json).
 */

type Portal = 'admin' | 'teacher' | 'department' | 'student' | 'parent' | 'alumni';

const ROLES: { role: UlsRole; portal: Portal; forbidden?: string }[] = [
  { role: 'admin', portal: 'admin' },
  { role: 'director', portal: 'admin' },
  { role: 'secretary', portal: 'admin', forbidden: '/payments/invoices/' },
  { role: 'accountant', portal: 'admin', forbidden: '/users/' },
  { role: 'teacher', portal: 'teacher', forbidden: '/payments/invoices/' },
  { role: 'department_head', portal: 'department', forbidden: '/payments/invoices/' },
  { role: 'student', portal: 'student', forbidden: '/students/' },
  { role: 'parent', portal: 'parent', forbidden: '/users/' },
  { role: 'alumni', portal: 'alumni', forbidden: '/students/' },
];

/** Portail d'un autre rôle, qu'aucun de ces comptes ne doit pouvoir ouvrir. */
const FOREIGN: Record<Portal, Portal> = {
  admin: 'student', teacher: 'admin', department: 'admin',
  student: 'admin', parent: 'admin', alumni: 'admin',
};

/** Espaces de noms i18n : un mot « ns.clé » affiché tel quel est une traduction manquante. */
const I18N_NAMESPACES = new Set(
  Object.keys(JSON.parse(fs.readFileSync(path.resolve('src/i18n/locales/fr.json'), 'utf8'))),
);

const BASELINE_FILE = path.resolve('tests/e2e/journeys/role-portals.baseline.json');
type Baseline = Record<string, string[]>;
const baseline: Baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));

/**
 * L'API limite chaque IP à 100 requêtes par minute (main.py, slowapi). Pour
 * que la recette mesure les pages et non la limite, chaque visite attend que
 * moins de API_BUDGET appels aient eu lieu sur la dernière minute.
 */
const API_BUDGET = 70;
const apiCalls: number[] = [];

async function throttle(): Promise<void> {
  for (;;) {
    while (apiCalls.length && Date.now() - apiCalls[0] > 60_000) apiCalls.shift();
    if (apiCalls.length < API_BUDGET) return;
    await new Promise((resolve) => setTimeout(resolve, 60_000 - (Date.now() - apiCalls[0]) + 250));
  }
}

/** Normalise une URL d'API : identifiants remplacés pour une clé stable. */
function apiKey(url: string): string {
  const u = new URL(url);
  return u.pathname
    .replace(/^\/api\/v1/, '')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id');
}

/**
 * Visite guidée de première connexion (OnboardingTour, affichée après 1 s
 * sur le tableau de bord admin) : la fermer comme un utilisateur, sinon son
 * calque bloque le menu.
 */
async function dismissTour(page: Page): Promise<void> {
  const skip = page.getByRole('button', { name: 'Passer', exact: true });
  await skip.waitFor({ state: 'visible', timeout: 2_500 }).catch(() => undefined);
  if (await skip.isVisible()) await skip.click();
}

/**
 * Message de console normalisé (identifiants, URL, nombres) pour que la clé
 * reste stable d'une exécution à l'autre. Les « Failed to load resource »
 * sont ignorés : chaque statut HTTP est déjà classé par les contrôles API.
 */
function consoleKey(text: string): string | null {
  if (/^Failed to load resource/.test(text)) return null;
  const line = text.split('\n')[0]
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\d+/g, 'N')
    .trim();
  return line.slice(0, 160);
}

/** Textes anormaux et clés de traduction brutes visibles dans la page. */
async function textAnomalies(page: Page): Promise<string[]> {
  const main = page.locator('main').first();
  const text = (await main.count()) ? await main.innerText() : await page.locator('body').innerText();
  const found = new Set<string>();
  for (const m of text.matchAll(/\b(undefined|NaN|Invalid Date)\b|\[object Object\]/g)) {
    found.add(`text: ${m[1] ?? m[0]}`);
  }
  for (const token of text.split(/[\s,;:()«»"']+/)) {
    const m = token.match(/^([a-z][a-zA-Z]+)\.[a-zA-Z0-9_.]+$/);
    if (m && I18N_NAMESPACES.has(m[1])) found.add(`raw-i18n: ${token}`);
  }
  return [...found].sort();
}

async function menuLinks(page: Page, prefix: string): Promise<string[]> {
  const collect = async () =>
    page.locator('aside a[href], nav a[href]').evaluateAll((links) =>
      links.map((a) => (a.getAttribute('href') ?? '').split(/[?#]/)[0]),
    );
  const hrefs = new Set(await collect());
  // Sections repliables (éventuellement en accordéon) : ouvrir chacune une
  // fois, avec un délai borné, et cumuler les liens visibles après chaque
  // ouverture.
  const triggers = page.locator('aside nav button[aria-expanded]');
  const count = await triggers.count();
  for (let i = 0; i < count; i++) {
    const trigger = triggers.nth(i);
    if ((await trigger.getAttribute('aria-expanded')) === 'false') {
      await trigger.click({ timeout: 3_000 }).catch(() => undefined);
    }
    for (const h of await collect()) hrefs.add(h);
  }
  return [...hrefs].filter((h) => h.startsWith(prefix)).sort();
}

async function inspect(page: Page, href: string, prefix: string, slug: string): Promise<string[]> {
  const apiErrors = new Set<string>();
  const onResponse = (r: Response) => {
    if (!r.url().startsWith(API)) return;
    const status = r.status();
    const method = r.request().method();
    if (status === 429) apiErrors.add(`api-429 ${method} ${apiKey(r.url())}`);
    else if (status === 403 || status === 422) apiErrors.add(`api-${status} ${method} ${apiKey(r.url())}`);
    else if (status >= 500) apiErrors.add(`api-5xx ${method} ${apiKey(r.url())}`);
    else if (status === 404 || status === 405) {
      // Un 404 d'API sur un identifiant précis peut être légitime ; seuls
      // les chemins sans identifiant signalent une route inexistante.
      const key = apiKey(r.url());
      if (!key.includes(':id')) apiErrors.add(`api-404 ${method} ${key}`);
    }
  };
  let inflight = 0;
  let lastActivity = Date.now();
  const onRequest = (r: { url: () => string }) => {
    if (!r.url().startsWith(API)) return;
    apiCalls.push(Date.now());
    inflight++;
    lastActivity = Date.now();
  };
  const onDone = (r: { url: () => string }) => {
    if (!r.url().startsWith(API)) return;
    inflight = Math.max(0, inflight - 1);
    lastActivity = Date.now();
  };
  const consoleErrors = new Set<string>();
  const onConsole = (m: ConsoleMessage) => {
    if (m.type() !== 'error') return;
    const k = consoleKey(m.text());
    if (k) consoleErrors.add(`console: ${k}`);
  };
  const onPageError = (e: Error) => {
    const k = consoleKey(String(e));
    if (k) consoleErrors.add(`console: ${k}`);
  };
  await throttle();
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('request', onRequest);
  page.on('requestfinished', onDone);
  page.on('requestfailed', onDone);
  page.on('response', onResponse);
  const defects: string[] = [];
  try {
    // Navigation interne (comme un clic dans le menu) : pas de rechargement,
    // donc pas de réémission des appels communs à chaque page.
    await page.evaluate((target) => {
      window.history.pushState({}, '', target);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, href);
    // Inactivité réseau de l'API : aucun appel en cours depuis 800 ms
    // (borne de 15 s pour une page qui interroge en continu).
    const deadline = Date.now() + 15_000;
    await page.waitForTimeout(300);
    while (Date.now() < deadline && (inflight > 0 || Date.now() - lastActivity < 800)) {
      await page.waitForTimeout(100);
    }
    const landed = new URL(page.url()).pathname;
    if (landed.endsWith('/login') || landed.endsWith('/auth')) defects.push('redirect-login');
    else if (!landed.startsWith(prefix)) defects.push(`redirect ${landed.replace(`/${slug}`, '')}`);
    if (await page.getByRole('heading', { name: '404', exact: true }).count()) defects.push('page-404');
    if (await page.getByText(/Une erreur (inattendue s'est produite|est survenue)/).count()) {
      defects.push('render-error');
    }
    defects.push(...(await textAnomalies(page)));
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
    page.off('request', onRequest);
    page.off('requestfinished', onDone);
    page.off('requestfailed', onDone);
  }
  return [...defects, ...[...consoleErrors].sort(), ...[...apiErrors].sort()];
}

// Un chef de département sans département n'a pas de portail exploitable
// (« Aucun département assigné ») : l'administration le désigne, comme dans
// un établissement réel.
test.beforeAll(async ({ request }) => {
  const admin = api(request, 'admin');
  const head = (await (await admin.get('/users/?search=chef.dept.uls')).json()).items[0] as { id: string };
  const departments = (await (await admin.get('/departments/')).json()) as { id: string; code: string; head_id?: string }[];
  const target = departments.find((d) => d.head_id === head.id)
    ?? [...departments].sort((a, b) => (a.code ?? '').localeCompare(b.code ?? ''))[0];
  expect(target, 'structure ULS chargée (départements)').toBeTruthy();
  if (target.head_id !== head.id) {
    expect((await admin.put(`/departments/${target.id}/`, { head_id: head.id })).status()).toBe(200);
  }
});

for (const { role, portal, forbidden } of ROLES) {
  test.describe(`Portail ${role}`, () => {
    test.use({ storageState: stateFile(role) });

    test(`chaque entrée du menu ${portal} fonctionne pour ${role}`, async ({ page }, testInfo) => {
      test.setTimeout(20 * 60_000);
      const slug = credentials().uls.slug;
      const prefix = `/${slug}/${portal}`;

      await page.goto(ulsUrl(`/${portal}`));
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
      expect(new URL(page.url()).pathname, `${role} doit rester sur son portail`).toMatch(
        new RegExp(`^${prefix}(/|$)`),
      );

      await dismissTour(page);
      const found: string[] = [];
      // Portail qui plante dès l'ouverture : pas de menu à parcourir.
      if (await page.getByText(/Une erreur (inattendue s'est produite|est survenue)/).count()) {
        found.push(`/${portal} portal render-error`);
      }
      const links = found.length ? [] : await menuLinks(page, prefix);
      if (!found.length) expect(links.length, `menu ${portal} vide pour ${role}`).toBeGreaterThan(0);

      const report: Record<string, string[]> = {};
      for (const href of links) {
        const defects = await inspect(page, href, prefix, slug);
        const route = href.replace(`/${slug}`, '');
        report[route] = defects;
        // Les défauts d'API sont rattachés à la route API, pas à la page : une
        // requête relancée (React Query) peut aboutir après le changement de
        // page. Les défauts d'affichage restent rattachés à la page.
        for (const d of defects) {
          const key = d.startsWith('api-') ? d : `${route} ${d}`;
          if (!found.includes(key)) found.push(key);
        }
      }
      await testInfo.attach(`role-portals-${role}.json`, {
        body: JSON.stringify({ role, links: links.length, report }, null, 2),
        contentType: 'application/json',
      });
      console.log(`[recette ${role}] ${links.length} entrées de menu visitées, ${found.length} défaut(s)`);

      const known = new Set((baseline[role] ?? []).filter((k) => !k.startsWith('foreign ')));
      const fresh = found.filter((f) => !known.has(f));
      const fixed = [...known].filter((k) => !found.includes(k));
      expect(fresh, `Nouveaux défauts pour ${role} (ajouter un correctif, pas la référence)`).toEqual([]);
      expect(fixed, `Défauts corrigés pour ${role} : les retirer de role-portals.baseline.json`).toEqual([]);
    });

    test(`${role} n'ouvre pas un autre portail et l'API refuse ses actions hors permission`, async ({ page, request }) => {
      const slug = credentials().uls.slug;
      const foreign = FOREIGN[portal];
      await page.goto(ulsUrl(`/${foreign}`));
      await page.waitForURL((url) => !url.pathname.startsWith(`/${slug}/${foreign}`), { timeout: 20_000 });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      const landed = new URL(page.url()).pathname;
      // Renvoyé vers son propre portail, pas vers la page publique.
      const found = landed.startsWith(`/${slug}/${portal}`)
        ? []
        : [`foreign /${foreign} redirect ${landed.replace(`/${slug}`, '') || '/'}`];
      const known = (baseline[role] ?? []).filter((k) => k.startsWith('foreign '));
      expect(found.filter((f) => !known.includes(f)), `${role} : redirection hors de son portail`).toEqual([]);
      expect(known.filter((k) => !found.includes(k)), `${role} : redirection corrigée, retirer la référence`).toEqual([]);

      const client = api(request, role);
      expect((await client.get('/users/me/')).status(), `${role} : profil`).toBe(200);
      if (forbidden) {
        expect((await client.get(forbidden)).status(), `${role} : GET ${forbidden}`).toBe(403);
      }
    });
  });
}
