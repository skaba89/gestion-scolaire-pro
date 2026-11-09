import { expect, test, type Page } from '@playwright/test';
import { api, loginThroughUi, ulsUrl } from './helpers';

/**
 * Parcours 10 — confidentialité des données hors ligne (O1).
 *
 * La page Présences de l'enseignant met en cache, dans IndexedDB, les élèves
 * de la classe (noms de mineurs) pour la saisie hors ligne. Sur un poste
 * partagé, rien ne doit en rester après la déconnexion : jusqu'ici seule la
 * file d'envoi était vidée, le cache d'élèves restait lisible.
 *
 * Session dédiée (connexion par l'interface) : la déconnexion ne révoque
 * pas la session partagée des autres parcours.
 */

const OFFLINE_DATABASES = ['SchoolFlowOfflineDB', 'schoolflow-offline', 'SchoolFlowDB'];

/** Nombre de lignes par base hors ligne, lues directement dans IndexedDB. */
async function offlineRowCounts(page: Page): Promise<Record<string, number>> {
  return page.evaluate(async (names) => {
    const existing = new Set((await indexedDB.databases()).map((d) => d.name));
    const result: Record<string, number> = {};
    for (const name of names) {
      if (!existing.has(name)) { result[name] = 0; continue; }
      result[name] = await new Promise<number>((resolve, reject) => {
        const open = indexedDB.open(name);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const stores = Array.from(db.objectStoreNames);
          if (stores.length === 0) { db.close(); resolve(0); return; }
          const tx = db.transaction(stores, 'readonly');
          let total = 0;
          let pending = stores.length;
          for (const store of stores) {
            const req = tx.objectStore(store).count();
            req.onsuccess = () => {
              total += req.result;
              if (--pending === 0) { db.close(); resolve(total); }
            };
            req.onerror = () => reject(req.error);
          }
        };
      });
    }
    return result;
  }, OFFLINE_DATABASES);
}

type Named = { id: string; name: string; code?: string };

/** Parcours autonome : l'enseignant doit être affecté à « L1 Économie »
 * (même préparation que le parcours 03, sans dépendre de son exécution). */
test.beforeAll(async ({ request }) => {
  const admin = api(request, 'admin');
  const classroom = ((await (await admin.get('/infrastructure/classrooms/')).json()) as Named[])
    .find((c) => c.name === 'L1 Économie')!;
  const subject = ((await (await admin.get('/subjects/')).json()) as Named[]).find((s) => s.code === 'ECO101')!;
  const teacher = (await (await admin.get('/users/?search=prof.uls')).json()).items[0];
  const assignments = (await (await admin.get('/teachers/')).json()).items as
    { user_id: string; classroom_id: string; subject_id: string }[];
  if (!assignments.some((a) => a.user_id === teacher.id && a.classroom_id === classroom.id && a.subject_id === subject.id)) {
    expect((await admin.post('/teachers/', { teacher_id: teacher.id, class_id: classroom.id, subject_id: subject.id })).status()).toBe(201);
  }
});

test('après déconnexion, aucune donnée hors ligne (élèves en cache) ne reste sur le poste', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await loginThroughUi(page, 'teacher');
    await page.goto(ulsUrl('/teacher/attendance'));
    await page.getByRole('combobox').filter({ hasText: 'Sélectionner une classe' }).click();
    await page.getByRole('option', { name: 'L1 Économie' }).click();

    // Le cache hors ligne se remplit (préalable du scénario).
    await expect
      .poll(async () => (await offlineRowCounts(page)).SchoolFlowOfflineDB, { timeout: 20_000 })
      .toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Déconnexion' }).first().click();
    await page.waitForURL((url) => !url.pathname.includes('/teacher'), { timeout: 20_000 });

    await expect
      .poll(async () => offlineRowCounts(page), { timeout: 10_000 })
      .toEqual({ SchoolFlowOfflineDB: 0, 'schoolflow-offline': 0, SchoolFlowDB: 0 });
  } finally {
    await context.close();
  }
});
