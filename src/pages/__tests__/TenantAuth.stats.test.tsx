import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import TenantAuthPage from '../TenantAuth';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ signIn: vi.fn(), isLoading: false }),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

// Forme réelle de GET /tenants/public/{slug} (backend/app/schemas/tenants.py).
vi.mock('@/hooks/usePublicTenant', () => ({
  usePublicTenant: () => ({
    isLoading: false,
    data: {
      id: 't1', name: 'Université La Source', slug: 'uls', type: 'university', is_active: true,
      landing: {}, stats: { student_count: 1240, teacher_count: 85 },
    },
  }),
}));

describe('TenantAuth — statistiques publiques', () => {
  it('affiche le nombre d\'étudiants renvoyé par l\'API (student_count)', () => {
    // Le code lisait stats.students_count : le compteur n'apparaissait jamais.
    render(
      <MemoryRouter initialEntries={['/uls/auth']}>
        <Routes>
          <Route path="/:tenantSlug/auth" element={<TenantAuthPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('1240 étudiants')).toBeInTheDocument();
  });
});
