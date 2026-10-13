import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SecuritySettings } from '../SecuritySettings';

const mutateAsync = vi.fn();
const idle = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };

vi.mock('@/hooks/queries/use2FA', () => ({
  useMFAStatus: () => ({ data: { enabled: true }, isLoading: false }),
  useToggleMFA: () => idle,
  useRequestOTP: () => idle,
  useVerifyOTP: () => idle,
  useGenerateBackupCodes: () => ({ mutate: vi.fn(), mutateAsync, isPending: false }),
  useBackupCodes: () => ({ data: [] }),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'a@example.com' } }) }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ tenant: { id: 't1' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('SecuritySettings — codes de secours', () => {
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue({ codes: ['AAAA-1111', 'BBBB-2222'] });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  // Régénérer invalide les anciens codes : avant, « Régénérer » ne montrait
  // jamais les nouveaux et « Afficher les codes de secours » plantait
  // (`mutate()` ne renvoie pas de promesse).
  it.each(['Régénérer', 'Afficher les codes de secours'])('« %s » affiche les nouveaux codes', async (label) => {
    const user = userEvent.setup();
    render(<SecuritySettings />);

    await user.click(screen.getByRole('button', { name: new RegExp(label) }));

    expect(await screen.findByText('AAAA-1111')).toBeInTheDocument();
    expect(screen.getByText('BBBB-2222')).toBeInTheDocument();
  });

  it('ne génère rien si l\'utilisateur annule', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const user = userEvent.setup();
    render(<SecuritySettings />);

    await user.click(screen.getByRole('button', { name: /Régénérer/ }));

    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
