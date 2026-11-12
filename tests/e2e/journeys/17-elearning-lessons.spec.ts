import { expect, test } from '@playwright/test';
import { api, stateFile, ulsUrl } from './helpers';

/**
 * Parcours 17 — e-learning de bout en bout (2026-11-12).
 *
 * Avant : les leçons n'étaient enregistrées nulle part (état du navigateur
 * de l'administrateur) et aucun élève n'avait d'espace « Mes cours ». Joué
 * sur la vraie stack, API sous rôle NOBYPASSRLS (tables sous RLS).
 */
test.describe('E-learning : leçons publiées lues et terminées par un élève', () => {
  test.use({ storageState: stateFile('student') });

  test('enseignant : cours → module → leçons ; élève : lecture → terminée', async ({ page, request }) => {
    const teacher = api(request, 'teacher');
    const student = api(request, 'student');
    const run = Date.now();
    const title = `Cours E2E ${run}`;

    // L'enseignant crée un cours publié (sans niveau : visible de tous les élèves).
    const course = await teacher.post('/analytics/elearning/courses/', { title, status: 'published' });
    expect(course.status(), await course.text()).toBe(201);
    const courseId = (await course.json()).id as string;
    const module = await teacher.post(`/analytics/elearning/courses/${courseId}/modules/`, { title: 'Premiers pas' });
    expect(module.status(), await module.text()).toBe(201);
    const moduleId = (await module.json()).id as string;
    const lesson = await teacher.post(`/analytics/elearning/modules/${moduleId}/lessons/`, {
      title: 'Lire un énoncé', content: `Lisez deux fois l'énoncé (${run}).`,
      resource_url: 'https://exemple.org/enonce', lesson_type: 'text', is_published: true,
    });
    expect(lesson.status(), await lesson.text()).toBe(201);
    const draft = await teacher.post(`/analytics/elearning/modules/${moduleId}/lessons/`, {
      title: 'Brouillon caché', lesson_type: 'text', is_published: false,
    });
    expect(draft.status()).toBe(201);

    // Un élève n'écrit pas dans un cours.
    expect((await student.post(`/analytics/elearning/courses/${courseId}/modules/`, { title: 'X' })).status()).toBe(403);

    // L'élève ouvre « Mes cours », lit la leçon publiée et la termine.
    await page.goto(ulsUrl('/student/courses'));
    const card = page.locator('div').filter({ has: page.getByText(title, { exact: true }) })
      .filter({ has: page.getByRole('button', { name: 'Commencer' }) }).last();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.getByRole('button', { name: 'Commencer' }).click();
    await expect(page.getByText(`Lisez deux fois l'énoncé (${run}).`)).toBeVisible();
    await expect(page.getByRole('link', { name: /Ouvrir la ressource/ })).toHaveAttribute('href', 'https://exemple.org/enonce');
    await expect(page.getByText('Brouillon caché')).toHaveCount(0);
    await page.getByRole('button', { name: 'Marquer comme terminée' }).click();
    await expect(page.getByText('Terminée').first()).toBeVisible();

    const mine = await (await student.get('/me/elearning/courses/')).json() as
      { id: string; lesson_count: number; completed_count: number }[];
    const summary = mine.find((c) => c.id === courseId)!;
    expect(summary.lesson_count).toBe(1);
    expect(summary.completed_count).toBe(1);
  });
});
