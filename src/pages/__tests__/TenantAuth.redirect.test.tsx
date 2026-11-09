import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

import TenantAuthPage from '../TenantAuth';

/**
 * R4 (recette E2E des portails) : la connexion choisissait le portail avec sa
 * propre liste de rôles, différente de celle des gardes de route. Un chef de
 * département ou un secrétaire passait par /admin avant d'être renvoyé, et
 * un rôle inconnu des gardes finissait sur la page publique.
 */

const signIn = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ signIn, completeMfaLogin: vi.fn(), startMfaSetup: vi.fn(), completeMfaSetup: vi.fn(), isLoading: false }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/usePublicTenant', () => ({
  usePublicTenant: () => ({
    isLoading: false,
    data: { id: 'tenant-1', name: 'Université La Source', slug: 'uls', type: 'university', is_active: true, landing: {} },
  }),
}));

const PORTALS = ['admin', 'teacher', 'department', 'student', 'parent', 'alumni'];

function login(roles: string[]) {
  signIn.mockResolvedValue({ error: null, profileData: { roles, tenant: { slug: 'uls' } } });
  render(
    <MemoryRouter initialEntries={['/uls/auth']}>
      <Routes>
        <Route path="/:tenantSlug/auth" element={<TenantAuthPage />} />
        {PORTALS.map((p) => (
          <Route key={p} path={`/:tenantSlug/${p}`} element={<p>{`portail ${p}`}</p>} />
        ))}
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'compte@uls.test' } });
  fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'Secret-2026!' } });
  fireEvent.click(screen.getByRole('button', { name: /se connecter/i }));
}

beforeEach(() => vi.clearAllMocks());

it.each([
  [['TENANT_ADMIN'], 'admin'],
  [['SECRETARY'], 'admin'],
  [['ACCOUNTANT'], 'admin'],
  [['DEPARTMENT_HEAD'], 'department'],
  [['TEACHER'], 'teacher'],
  [['PARENT'], 'parent'],
  [['STUDENT'], 'student'],
  [['ALUMNI'], 'alumni'],
])('%j arrive directement sur le portail %s', async (roles, portal) => {
  login(roles);
  expect(await screen.findByText(`portail ${portal}`)).toBeInTheDocument();
});

it("un rôle sans portail garde l'ancien repli /admin, jamais la page publique", async () => {
  login(['MINISTRY_ADMIN']);
  expect(await screen.findByText('portail admin')).toBeInTheDocument();
});
