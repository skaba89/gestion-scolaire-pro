import { expect, test } from '@playwright/test';
import { api, stateFile, ulsUrl } from './helpers';

/**
 * Parcours 16 — rendez-vous parents-enseignants, de bout en bout.
 *
 * Avant : la fonction n'avait jamais marché (création de créneau refusée,
 * réservation en échec sur PostgreSQL, confirmation / annulation vers des
 * routes absentes, double réservation possible). Joué sur la vraie stack,
 * API sous rôle NOBYPASSRLS : les jointures (créneau, enseignant, parent,
 * élève) passent par la RLS.
 */

const pad = (n: number) => String(n).padStart(2, '0');

test.describe('Rendez-vous parents-enseignants', () => {
  test.use({ storageState: stateFile('parent') });

  test('créneau → réservation → confirmation → annulation par le parent', async ({ page, request }) => {
    const teacher = api(request, 'teacher');
    const parent = api(request, 'parent');
    const otherFamily = api(request, 'admin');

    // Créneau unique (date et heure aléatoires : le parcours peut être rejoué).
    const day = new Date(Date.now() + (21 + Math.floor(Math.random() * 60)) * 86_400_000).toISOString().split('T')[0];
    const hour = 8 + Math.floor(Math.random() * 9);
    const minute = Math.floor(Math.random() * 44);
    const created = await teacher.post('/school-life/appointment-slots/', {
      date: day, start_time: `${pad(hour)}:${pad(minute)}`, end_time: `${pad(hour)}:${pad(minute + 15)}`, location: 'Salle des professeurs',
    });
    expect(created.status(), await created.text()).toBe(201);
    const slot = await created.json();
    expect(slot.is_available).toBe(true);

    // Le parent voit le créneau et réserve pour son enfant.
    const slots = await (await parent.get('/parents/appointment-slots/')).json() as { id: string }[];
    expect(slots.map((s) => s.id)).toContain(slot.id);
    const children = await (await parent.get('/parents/children/')).json() as { student: { id: string; registration_number: string } }[];
    const child = children.map((c) => c.student).find((s) => s.registration_number === 'E2E-ROLE-ETU')!;
    const notes = `E2E parcours 16 ${Date.now()}`;
    const booked = await parent.post('/parents/appointments/', { slot_id: slot.id, student_id: child.id, notes });
    expect(booked.status(), await booked.text()).toBe(201);
    const appointment = await booked.json();
    expect(appointment.status).toBe('REQUESTED');
    expect(appointment.location).toBe('Salle des professeurs');

    // Créneau complet : une seconde réservation est refusée, il n'est plus proposé.
    const again = await parent.post('/parents/appointments/', { slot_id: slot.id, student_id: child.id });
    expect(again.status()).toBe(409);
    expect(((await (await parent.get('/parents/appointment-slots/')).json()) as { id: string }[]).map((s) => s.id))
      .not.toContain(slot.id);
    // Un compte qui n'est pas parent n'utilise pas ces routes.
    expect((await otherFamily.post('/parents/appointments/', { slot_id: slot.id, student_id: child.id })).status()).toBe(403);

    // L'enseignant voit la demande et la confirme.
    const teacherList = await (await teacher.get('/school-life/appointment-slots/appointments/?status=REQUESTED')).json() as
      { id: string; student: { id: string } }[];
    expect(teacherList.find((a) => a.id === appointment.id)?.student.id).toBe(child.id);
    const confirmed = await teacher.patch(`/school-life/appointment-slots/appointments/${appointment.id}/`, { status: 'CONFIRMED' });
    expect(confirmed.status(), await confirmed.text()).toBe(200);

    // Le parent le voit confirmé dans son portail et l'annule par l'interface.
    await page.goto(ulsUrl('/parent/appointments'));
    const card = page.locator('div.rounded-lg', { hasText: notes }).filter({ has: page.getByRole('button') }).last();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText('Confirmé')).toBeVisible();
    await card.getByRole('button', { name: /Annuler/ }).click();
    await expect(page.getByText('Rendez-vous annulé').first()).toBeVisible();

    const mine = await (await parent.get('/parents/appointments/?page_size=100')).json() as { items: { id: string; status: string }[] };
    expect(mine.items.find((a) => a.id === appointment.id)?.status).toBe('CANCELLED');
    // Le créneau est de nouveau réservable.
    expect(((await (await parent.get('/parents/appointment-slots/')).json()) as { id: string }[]).map((s) => s.id))
      .toContain(slot.id);
  });
});
