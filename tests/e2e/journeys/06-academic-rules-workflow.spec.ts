import { expect, test } from '@playwright/test';
import { API, api, stateFile, tokenOf, ulsUrl } from './helpers';

/**
 * Parcours 6 — configuration des règles académiques sur la stack réelle
 * (PostgreSQL sous RLS NOBYPASSRLS + interface React).
 *
 * Vérifie l'enregistrement, la relecture par niveau, la visibilité dans
 * l'interface, le refus d'écriture enseignant et l'isolation inter-tenant.
 * Toute mutation est annulée dans finally, y compris lorsque le test échoue.
 */
test.use({ storageState: stateFile('admin') });

type Rules = {
  passing_grade: number;
  mentions: { label: string; min: number }[];
};
type RulesResponse = {
  default: Rules | null;
  defaults: Rules;
  levels: { level_id: string; level_name: string; rules: Rules }[];
  available_levels: { id: string; name: string }[];
};

const url = `${API}/tenants/settings/academic-rules/`;
const auth = (role: 'admin' | 'teacher' | 'witness') => ({
  Authorization: `Bearer ${tokenOf(role)}`,
});

test('admin configure des seuils, l’interface les affiche et les rôles restent isolés', async ({ page, request }) => {
  const beforeResponse = await request.get(url, { headers: auth('admin') });
  expect(beforeResponse.status()).toBe(200);
  const before = (await beforeResponse.json()) as RulesResponse;
  expect(before.available_levels.length).toBeGreaterThan(0);

  const levelId = before.available_levels[0].id;
  const ownRules: Rules = {
    passing_grade: 11,
    mentions: [
      { label: 'Assez Bien', min: 12 },
      { label: 'Bien', min: 14 },
      { label: 'Très Bien', min: 16 },
      { label: 'Excellent', min: 18 },
    ],
  };
  const levelRules: Rules = {
    ...ownRules,
    passing_grade: 12,
    mentions: ownRules.mentions.map((m) =>
      m.label === 'Assez Bien' ? { ...m, min: 13 } : { ...m }),
  };
  const initialLevels = Object.fromEntries(before.levels.map((l) => [l.level_id, l.rules]));

  try {
    // L'enseignant peut consulter les règles mais ne peut pas les changer.
    const teacherGet = await request.get(url, { headers: auth('teacher') });
    expect(teacherGet.status()).toBe(200);
    const teacherPut = await request.put(url, {
      headers: auth('teacher'), data: { default: ownRules, levels: {} },
    });
    expect(teacherPut.status()).toBe(403);

    // L'établissement témoin ne peut pas configurer un niveau de l'ULS.
    const witnessPut = await request.put(url, {
      headers: auth('witness'), data: { default: null, levels: { [levelId]: levelRules } },
    });
    expect(witnessPut.status()).toBe(404);

    // L'administration configure une règle propre à l'établissement et
    // une autre à un niveau ; le serveur fait foi.
    const saved = await request.put(url, {
      headers: auth('admin'),
      data: { default: ownRules, levels: { ...initialLevels, [levelId]: levelRules } },
    });
    expect(saved.status()).toBe(200);
    const read = await request.get(url, { headers: auth('admin') });
    expect(read.status()).toBe(200);
    const data = (await read.json()) as RulesResponse;
    expect(data.default?.passing_grade).toBe(11);
    expect(data.levels.find((l) => l.level_id === levelId)?.rules.passing_grade).toBe(12);

    // Vérification de bout en bout : les valeurs enregistrées apparaissent
    // dans les champs du formulaire réellement affiché au navigateur.
    await page.goto(ulsUrl('/admin/academic-rules'));
    await expect(page.locator('#school-passing')).toHaveValue('11');
    await expect(page.locator(`[id="level-${levelId}-passing"]`)).toHaveValue('12');

    // Bouton de réinitialisation : le formulaire revient au seuil standard.
    await page.getByRole('button', { name: /Réinitialiser|valeurs par défaut|Valeurs habituelles/i }).click();
    await expect(page.locator('#school-passing')).toHaveValue('10');
    await page.getByRole('button', { name: /Enregistrer|Sauvegarder/i }).first().click();
    await expect.poll(async () => {
      const response = await request.get(url, { headers: auth('admin') });
      expect(response.status()).toBe(200);
      return ((await response.json()) as RulesResponse).default;
    }).toBeNull();
  } finally {
    // Dette technique E2E : ne jamais contaminer les autres parcours en
    // laissant une configuration modifiée dans la base partagée.
    const restored = await request.put(url, {
      headers: auth('admin'),
      data: { default: before.default, levels: initialLevels },
    });
    expect(restored.status()).toBe(200);
  }
});
