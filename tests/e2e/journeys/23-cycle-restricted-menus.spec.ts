import { expect, test, type Page, type Response } from '@playwright/test';
import { API, api, credentials, loginThroughUi, ulsUrl } from './helpers';

/**
 * Parcours 23 — lot B3 : un compte limité à un cycle ne voit que ses écrans.
 *
 * L'administration crée un cycle, y rattache le niveau d'une classe, et limite le
 * secrétariat à ce cycle. Le secrétariat se reconnecte (la restriction ferme ses
 * sessions) puis :
 * - son menu ne contient que des écrans accessibles selon GET /education/my-scope/ et
 *   perd au moins une entrée qu'il avait sans restriction (admissions) ;
 * - chaque entrée visible s'ouvre sans aucun refus 403 de l'API ;
 * - un écran hors périmètre ouvert par son URL affiche « Écran hors de votre périmètre ».
 * La restriction, le rattachement du niveau et le cycle sont retirés en fin de parcours.
 */
test.describe('Lot B3 — menus d\'un compte limité à un cycle', () => {
  test('le secrétariat restreint ne voit et n\'ouvre que les écrans de son périmètre', async ({ page, request }) => {
    test.setTimeout(10 * 60_000);
    const admin = api(request, 'admin');
    const slug = credentials().uls.slug;
    const email = credentials().uls.secretary.email;
    const suffix = Date.now().toString(36).toUpperCase();

    const staff = (await (await admin.get('/education/staff-cycles/?limit=500')).json()) as {
      items: { user_id: string; email: string; cycle_ids: string[] }[];
    };
    const secretary = staff.items.find((item) => item.email === email);
    expect(secretary, 'compte secrétariat de recette restreignable').toBeTruthy();
    // Un niveau d'une classe existante et sans cycle : la structure de recette est rendue intacte.
    const classrooms = (await (await admin.get('/infrastructure/classrooms/')).json()) as { id: string; level_id?: string | null }[];
    const cycles = (await (await admin.get('/education/cycles/')).json()) as { level_ids: string[] }[];
    const taken = new Set(cycles.flatMap((c) => c.level_ids));
    const levelId = classrooms.find((c) => c.level_id && !taken.has(c.level_id))?.level_id;
    expect(levelId, 'une classe dont le niveau n\'a pas de cycle').toBeTruthy();

    const created = await admin.post('/education/cycles/', {
      code: `B3-${suffix}`, name: `Cycle B3 ${suffix}`, institution_type: 'university', period_type: 'SEMESTER',
    });
    expect(created.status()).toBe(201);
    let cycle = (await created.json()) as { id: string; revision: number };

    try {
      const linked = await admin.put(`/education/cycles/${cycle.id}/levels/`, {
        expected_revision: cycle.revision, level_ids: [levelId],
      });
      expect(linked.status()).toBe(200);
      cycle = await linked.json();
      const restricted = await admin.put(`/education/staff-cycles/${secretary!.user_id}/`, {
        expected_cycle_ids: secretary!.cycle_ids, cycle_ids: [cycle.id],
      });
      expect(restricted.status()).toBe(200);

      await loginThroughUi(page, 'secretary');
      const token = await page.evaluate(() => window.localStorage.getItem('schoolflow:access_token'));
      const scope = (await (await request.get(`${API}/education/my-scope/`, {
        headers: { Authorization: `Bearer ${token}` },
      })).json()) as { restricted: boolean; pages: Record<string, boolean> };
      expect(scope.restricted).toBe(true);

      const prefix = `/${slug}/admin`;
      await page.goto(ulsUrl('/admin'));
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
      const links = await menuLinks(page, prefix);
      expect(links.length).toBeGreaterThan(0);
      const pageOf = (href: string) => {
        const rest = href.slice(prefix.length).split('/').filter(Boolean);
        const two = rest.slice(0, 2).join('/');
        return rest.length >= 2 && two in scope.pages ? two : (rest[0] ?? '');
      };
      const outside = links.filter((href) => scope.pages[pageOf(href)] !== true);
      expect(outside, 'entrées de menu hors périmètre').toEqual([]);
      // Admissions ouvertes aux comptes restreints (lot Admissions) ; gestion des comptes encore réservée.
      expect(links.some((href) => href.endsWith('/admin/admissions')), 'admissions visibles').toBe(true);
      expect(links.some((href) => href.endsWith('/admin/users')), 'gestion des comptes masquée').toBe(false);
      expect(links.some((href) => href.endsWith('/admin/students')), 'élèves visibles').toBe(true);

      const refused: string[] = [];
      for (const href of links) {
        for (const failure of await visit(page, href)) refused.push(`${href.replace(`/${slug}`, '')} ${failure}`);
      }
      expect(refused, 'refus de l\'API sur un écran du menu').toEqual([]);

      await page.goto(ulsUrl('/admin/users'));
      await expect(page.getByRole('alert')).toContainText('Écran hors de votre périmètre');
    } finally {
      const current = (await (await admin.get('/education/staff-cycles/?limit=500')).json()).items
        .find((item: { email: string }) => item.email === email) as { user_id: string; cycle_ids: string[] };
      expect((await admin.put(`/education/staff-cycles/${current.user_id}/`, {
        expected_cycle_ids: current.cycle_ids, cycle_ids: [],
      })).status()).toBe(200);
      const latest = (await (await admin.get('/education/cycles/')).json())
        .find((item: { id: string }) => item.id === cycle.id) as { revision: number };
      expect((await admin.put(`/education/cycles/${cycle.id}/levels/`, {
        expected_revision: latest.revision, level_ids: [],
      })).status()).toBe(200);
      const unlinked = (await (await admin.get('/education/cycles/')).json())
        .find((item: { id: string }) => item.id === cycle.id) as { revision: number };
      expect((await admin.patch(`/education/cycles/${cycle.id}/`, {
        expected_revision: unlinked.revision, is_active: false,
      })).status()).toBe(200);
    }
  });
});

async function menuLinks(page: Page, prefix: string): Promise<string[]> {
  const collect = async () => page.locator('aside a[href], nav a[href]').evaluateAll((links) =>
    links.map((a) => (a.getAttribute('href') ?? '').split(/[?#]/)[0]));
  const hrefs = new Set(await collect());
  const triggers = page.locator('aside nav button[aria-expanded]');
  for (let i = 0; i < await triggers.count(); i++) {
    const trigger = triggers.nth(i);
    if ((await trigger.getAttribute('aria-expanded')) === 'false') {
      await trigger.click({ timeout: 3_000 }).catch(() => undefined);
    }
    for (const h of await collect()) hrefs.add(h);
  }
  return [...hrefs].filter((h) => h === prefix || h.startsWith(`${prefix}/`)).sort();
}

/** Ouvre un écran par navigation interne et renvoie les refus 403 de l'API (méthode + chemin). */
async function visit(page: Page, href: string): Promise<string[]> {
  const refused = new Set<string>();
  const onResponse = (r: Response) => {
    if (r.url().startsWith(API) && r.status() === 403) {
      refused.add(`${r.request().method()} ${new URL(r.url()).pathname.replace('/api/v1', '')}`);
    }
  };
  page.on('response', onResponse);
  try {
    await page.evaluate((target) => {
      window.history.pushState({}, '', target);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, href);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(500);
  } finally {
    page.off('response', onResponse);
  }
  return [...refused].sort();
}
