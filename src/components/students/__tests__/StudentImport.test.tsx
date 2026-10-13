import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/api/client';
import { StudentImport } from '../StudentImport';

vi.mock('@/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: { id: 't1', settings: {} } }),
}));

vi.mock('@/hooks/useStudentLabel', () => ({
  useStudentLabel: () => ({ studentsLabel: 'élèves', StudentsLabel: 'Élèves' }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const csv = 'prenom,nom,matricule\nAwa,Bah,M-001\nMoussa,Camara,M-002\nFanta,Diallo,M-003\n';

describe('StudentImport', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { settings: {} } } as any);
    vi.mocked(apiClient.patch).mockResolvedValue({ data: {} } as any);
    vi.mocked(apiClient.post).mockReset();
  });

  it('une ligne refusée n\'interrompt plus l\'import et son motif est affiché', async () => {
    // apiClient lève une exception sur erreur (axios) : avant, la 2e ligne
    // arrêtait tout, la 3e n'était jamais envoyée et l'écran disait seulement
    // « Erreur lors de l'import ».
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({ data: {} } as any)
      .mockRejectedValueOnce({ response: { data: { detail: 'Matricule déjà utilisé' } } })
      .mockResolvedValueOnce({ data: {} } as any);
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}><StudentImport /></QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: /Importer CSV/ }));
    const input = document.body.querySelector('input[type=file]') as HTMLInputElement;
    await user.upload(input, new File([csv], 'eleves.csv', { type: 'text/csv' }));
    await user.click(await screen.findByRole('button', { name: 'Prévisualiser' }));
    await user.click(screen.getByRole('button', { name: /Importer 3/ }));

    expect(await screen.findByText(/Ligne 3: Matricule déjà utilisé/)).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledTimes(3);
    // La séquence de matricules est enregistrée puisque des élèves ont été créés.
    expect(apiClient.patch).toHaveBeenCalledWith('/tenants/t1/', expect.anything());
  });
});
