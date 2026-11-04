import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn(), post = vi.fn(), del = vi.fn();
vi.mock('@/api/client', () => ({
  apiClient: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a), delete: (...a: unknown[]) => del(...a) },
}));

import { cardToBadge, issueStudentCards, resolveScannedCard, revokeStudentCard } from '../studentCards';

beforeEach(() => { get.mockReset(); post.mockReset(); del.mockReset(); });

const card = { student_id: 's1', first_name: 'Awa', last_name: 'Camara', registration_number: 'M-1', card_uid: 'SF-ABC' };

describe('cardToBadge', () => {
  it('le QR contient le code brut de la fiche élève (lu par la borne)', () => {
    expect(cardToBadge(card)).toMatchObject({ id: 's1', badge_code: 'SF-ABC', qr_code_data: 'SF-ABC', status: 'ACTIVE' });
  });
  it("pas de carte → rien à afficher (pas de badge inventé)", () => {
    expect(cardToBadge({ ...card, card_uid: null })).toBeNull();
  });
});

describe('API cartes', () => {
  it('émission et réémission passent par la route du serveur', async () => {
    post.mockResolvedValue({ data: { changed: 1, cards: [card] } });
    await issueStudentCards(['s1'], true);
    expect(post).toHaveBeenCalledWith('/school-life/student-cards/issue/', { student_ids: ['s1'], reissue: true });
  });

  it('retrait et résolution d’un scan', async () => {
    del.mockResolvedValue({});
    await revokeStudentCard('s1');
    expect(del).toHaveBeenCalledWith('/school-life/student-cards/s1/');
    get.mockResolvedValue({ data: null });
    expect(await resolveScannedCard(' SF-XYZ ')).toBeNull();
    expect(get).toHaveBeenCalledWith('/school-life/check-ins/badges/', { params: { qr_code_data: 'SF-XYZ' } });
  });
});
