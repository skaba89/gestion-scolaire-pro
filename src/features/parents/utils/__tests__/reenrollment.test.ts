import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
const post = vi.fn();
vi.mock('@/api/client', () => ({
  apiClient: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) },
}));

import { fetchMyReenrollments, nextAcademicYear, submitReenrollment } from '../reenrollment';

// Ordre renvoyé par GET /academic-years/ : du plus récent au plus ancien.
const years = [
  { id: 'y2027', name: '2027-2028', start_date: '2027-09-01' },
  { id: 'y2026', name: '2026-2027', start_date: '2026-09-01', is_current: true },
  { id: 'y2025', name: '2025-2026', start_date: '2025-09-01' },
];

beforeEach(() => { get.mockReset(); post.mockReset(); });

describe('nextAcademicYear', () => {
  it("renvoie l'année SUIVANTE, pas la précédente (défaut corrigé)", () => {
    expect(nextAcademicYear(years)?.id).toBe('y2027');
  });

  it("sans année en cours : la première qui commence après aujourd'hui", () => {
    const noCurrent = years.map(({ is_current: _ignored, ...y }) => y);
    expect(nextAcademicYear(noCurrent, new Date('2026-11-03'))?.id).toBe('y2027');
  });

  it("aucune année future configurée → null (rien d'inventé)", () => {
    expect(nextAcademicYear(years.slice(1))).toBeNull();
    expect(nextAcademicYear([])).toBeNull();
  });
});

describe('API réinscription', () => {
  it('lit les demandes du parent sur la route authentifiée, la plus récente par enfant', async () => {
    get.mockResolvedValue({ data: [
      { id: 'a2', student_id: 's1', status: 'SUBMITTED' },
      { id: 'a1', student_id: 's1', status: 'REJECTED' },
      { id: 'b1', student_id: 's2', status: 'ACCEPTED' },
    ] });

    const byStudent = await fetchMyReenrollments('y2027');

    expect(get).toHaveBeenCalledWith('/admissions/reenrollments/mine/', { params: { academic_year_id: 'y2027' } });
    expect(byStudent.s1.id).toBe('a2');
    expect(byStudent.s2.status).toBe('ACCEPTED');
  });

  it("n'envoie ni e-mail ni téléphone : le serveur prend ceux du compte", async () => {
    post.mockResolvedValue({ data: { id: 'a3', status: 'SUBMITTED' } });

    await submitReenrollment({ studentId: 's1', academicYearId: 'y2027', levelId: '', notes: '  ' });

    expect(post).toHaveBeenCalledWith('/admissions/reenrollments/', {
      student_id: 's1', academic_year_id: 'y2027', level_id: null, notes: null,
    });
  });
});
