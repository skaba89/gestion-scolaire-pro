import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TenantAuthPage from '../TenantAuth';

const TENANT_ID = '82605831-1c0e-4e04-82e2-2b55db951e00';
const ADMIN_PROFILE = { roles: ['TENANT_ADMIN'], tenant: { slug: 'uls' } };

const signIn = vi.fn();
const completeMfaLogin = vi.fn();
const startMfaSetup = vi.fn();
const completeMfaSetup = vi.fn();
const toast = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ signIn, completeMfaLogin, startMfaSetup, completeMfaSetup, isLoading: false }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
const t = (key: string) => key;
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t }) }));
vi.mock('@/hooks/usePublicTenant', () => ({
  usePublicTenant: () => ({
    isLoading: false,
    data: { id: TENANT_ID, name: 'Université La Source', slug: 'uls', type: 'university', is_active: true, landing: {} },
  }),
}));

function renderLogin() {
  render(
    <MemoryRouter initialEntries={['/uls/auth']}>
      <Routes>
        <Route path="/:tenantSlug/auth" element={<TenantAuthPage />} />
        <Route path="/:tenantSlug/admin" element={<p>Espace administration</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function submitCredentials() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@uls.test' } });
  fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'Secret-2026!' } });
  fireEvent.click(screen.getByRole('button', { name: /se connecter/i }));
}

function submitCode(code: string) {
  fireEvent.change(screen.getByLabelText('auth.mfa.codeLabel'), { target: { value: code } });
  fireEvent.submit(screen.getByLabelText('auth.mfa.codeLabel').closest('form') as HTMLFormElement);
}

describe('TenantAuth — connexion avec MFA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche la saisie du code au lieu de « Aucun établissement associé »', async () => {
    // La page ignorait mfa_required : profileData absent → toast d'erreur
    // trompeur et aucun moyen de saisir le code.
    signIn.mockResolvedValue({ error: null, mfaRequired: true, mfaToken: 'pending-token' });
    completeMfaLogin.mockResolvedValue({ error: null, profileData: ADMIN_PROFILE });
    renderLogin();

    submitCredentials();
    expect(await screen.findByText('auth.mfa.challengeTitle')).toBeInTheDocument();
    expect(signIn).toHaveBeenCalledWith('admin@uls.test', 'Secret-2026!', TENANT_ID);

    submitCode('123456');
    expect(await screen.findByText('Espace administration')).toBeInTheDocument();
    expect(completeMfaLogin).toHaveBeenCalledWith('pending-token', '123456', TENANT_ID);
    expect(toast).not.toHaveBeenCalled();
  });

  it('guide l\'activation forcée de la MFA puis ouvre la session', async () => {
    signIn.mockResolvedValue({ error: null, mfaSetupRequired: true, mfaSetupToken: 'setup-token' });
    startMfaSetup.mockResolvedValue({
      error: null, secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/Academy:admin@uls.test?secret=JBSWY3DPEHPK3PXP',
    });
    completeMfaSetup.mockResolvedValue({ error: null, profileData: ADMIN_PROFILE });
    renderLogin();

    submitCredentials();
    expect(await screen.findByText('auth.mfa.setupTitle')).toBeInTheDocument();
    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    expect(startMfaSetup).toHaveBeenCalledWith('setup-token');

    submitCode('654321');
    expect(await screen.findByText('Espace administration')).toBeInTheDocument();
    expect(completeMfaSetup).toHaveBeenCalledWith('setup-token', '654321', TENANT_ID);
  });

  it('reste sur l\'étape MFA si le code est refusé', async () => {
    signIn.mockResolvedValue({ error: null, mfaRequired: true, mfaToken: 'pending-token' });
    completeMfaLogin.mockResolvedValue({ error: new Error('Code invalide') });
    renderLogin();

    submitCredentials();
    await screen.findByText('auth.mfa.challengeTitle');
    submitCode('000000');

    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })));
    expect(screen.getByText('auth.mfa.challengeTitle')).toBeInTheDocument();
    expect(screen.queryByText('Espace administration')).not.toBeInTheDocument();
  });

  it('revient au formulaire avec « Retour à la connexion »', async () => {
    signIn.mockResolvedValue({ error: null, mfaRequired: true, mfaToken: 'pending-token' });
    renderLogin();

    submitCredentials();
    await screen.findByText('auth.mfa.challengeTitle');
    fireEvent.click(screen.getByRole('button', { name: 'auth.mfa.backToLogin' }));

    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
  });
});
