import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/api/client';
import { attendanceService } from '../attendanceService';

vi.mock('@/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const form = {
  student_id: 'stu-1', class_id: 'class-1', date: '2026-10-12', status: 'ABSENT' as const, notes: 'Malade',
};

describe('attendanceService.upsertAttendance', () => {
  beforeEach(() => vi.clearAllMocks());

  it("crée la présence avec classroom_id quand l'étudiant n'est pas encore pointé", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { items: [] } });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'att-1' } });

    await attendanceService.upsertAttendance('t1', form);

    expect(apiClient.post).toHaveBeenCalledWith('/attendance/', {
      student_id: 'stu-1', date: '2026-10-12', status: 'ABSENT', reason: 'Malade', classroom_id: 'class-1',
    });
    expect(apiClient.patch).not.toHaveBeenCalled();
  });

  it('met à jour la présence existante au lieu de la dupliquer', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { items: [{ id: 'att-9', student_id: 'stu-1', date: '2026-10-12T00:00:00' }] },
    });
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { id: 'att-9' } });

    await attendanceService.upsertAttendance('t1', { ...form, status: 'PRESENT', notes: undefined });

    expect(apiClient.patch).toHaveBeenCalledWith('/attendance/att-9/', { status: 'PRESENT', reason: undefined });
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("n'appelle jamais la route inexistante /attendance/upsert/ (405)", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });

    await attendanceService.upsertAttendance('t1', form);

    const urls = vi.mocked(apiClient.post).mock.calls.map((c) => c[0]);
    expect(urls).not.toContain('/attendance/upsert/');
  });
});
