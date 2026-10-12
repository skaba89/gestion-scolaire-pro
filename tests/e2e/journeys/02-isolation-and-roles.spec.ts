import { expect, test } from '@playwright/test';
import { API, api, credentials, stateFile, tokenOf, ulsUrl } from './helpers';

/**
 * Parcours 2 — isolation entre établissements et rôles, sous RLS réelle
 * (l'API tourne avec un rôle PostgreSQL NOBYPASSRLS).
 */

test.describe('Isolation entre établissements', () => {
  test('l\'admin d\'un autre établissement ne voit aucune donnée de l\'Université La Source', async ({ request }) => {
    const uls = credentials().uls;
    const ulsStudents = await (await api(request, 'admin').get('/students/?page_size=100')).json();
    expect(ulsStudents.total).toBeGreaterThan(0); // sinon le test ne prouverait rien
    const someId = ulsStudents.items[0].id;

    const witness = api(request, 'witness');
    expect((await witness.get(`/students/${someId}/`)).status()).toBe(404);

    const own = await (await witness.get('/students/?page_size=100')).json();
    const ulsIds = new Set(ulsStudents.items.map((s: { id: string }) => s.id));
    expect(own.items.filter((s: { id: string }) => ulsIds.has(s.id))).toEqual([]);

    const classrooms = await (await witness.get('/infrastructure/classrooms/')).json();
    expect(classrooms.map((c: { name: string }) => c.name)).not.toContain('L1 Économie');

    // Forcer l'en-tête de tenant ne change rien pour un non-SUPER_ADMIN.
    const forced = await request.get(`${API}/students/?page_size=100`, {
      headers: { Authorization: `Bearer ${tokenOf('witness')}`, 'X-Tenant-ID': uls.id },
    });
    expect(forced.status()).toBe(200);
    expect((await forced.json()).items.filter((s: { id: string }) => ulsIds.has(s.id))).toEqual([]);
  });

  test('il ne peut ni lire ni modifier la fiche de l\'Université La Source', async ({ request }) => {
    const ulsId = credentials().uls.id;
    const headers = { Authorization: `Bearer ${tokenOf('witness')}` };
    expect((await request.get(`${API}/tenants/${ulsId}/`, { headers })).status()).toBe(403);
    expect((await request.patch(`${API}/tenants/${ulsId}/`, { headers, data: { name: 'Piraté' } })).status()).toBe(403);

    const name = (await (await api(request, 'admin').get(`/tenants/${ulsId}/`)).json()).name;
    expect(name).toBe('Université La Source (démo)');
  });
});

test.describe("URL d'un autre établissement", () => {
  test.use({ storageState: stateFile('witness') });

  test("l'admin du témoin est renvoyé vers son propre établissement", async ({ page }) => {
    const { uls, witness } = credentials();
    await page.goto(`/${uls.slug}/admin/students`);
    await page.waitForURL(new RegExp(`/${witness.slug}/admin/students`));
    await expect(page.getByText('Université La Source')).toHaveCount(0);
  });
});

test.describe('Rôle enseignant', () => {
  test.use({ storageState: stateFile('teacher') });

  test('l\'API refuse les finances à un enseignant', async ({ request }) => {
    const teacher = api(request, 'teacher');
    expect((await teacher.get('/payments/invoices/')).status()).toBe(403);
    expect((await teacher.get('/payments/fees/')).status()).toBe(403);
  });

  test('l\'interface renvoie l\'enseignant vers son espace', async ({ page }) => {
    await page.goto(ulsUrl('/admin/finances'));
    await page.waitForURL(/\/teacher(\/|$)/);
    await expect(page.locator('a[href$="/teacher/grades"]').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Finances/ })).toHaveCount(0);
  });
});
