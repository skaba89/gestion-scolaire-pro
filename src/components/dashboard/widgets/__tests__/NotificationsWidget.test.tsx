import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/api/client';
import { NotificationsWidget } from '../NotificationsWidget';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

const notifications = [
  {
    id: 'notification-1',
    type: 'alert',
    title: 'Facture arrivée à échéance',
    message: 'Une facture nécessite votre attention.',
    is_read: false,
  },
  {
    id: 'notification-2',
    type: 'grade',
    title: 'Notes publiées',
    message: null,
    is_read: true,
  },
];

function renderWithQueryClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('NotificationsWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: notifications });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { status: 'ok' } });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: null });
  });

  it('affiche les notifications réelles et leur état de lecture', async () => {
    renderWithQueryClient(<NotificationsWidget />);

    expect(await screen.findByText('Facture arrivée à échéance')).toBeInTheDocument();
    expect(screen.getByText('Notes publiées')).toBeInTheDocument();
    expect(screen.getByText('Nouveau')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/notifications/', { params: { limit: 5 } });
  });

  it('permet de supprimer une notification', async () => {
    renderWithQueryClient(<NotificationsWidget />);
    const deleteButton = await screen.findByRole('button', {
      name: 'Supprimer la notification Facture arrivée à échéance',
    });

    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('/notifications/notification-1/');
    });
  });

  it('permet de marquer toutes les notifications non lues', async () => {
    renderWithQueryClient(<NotificationsWidget />);
    const markAllButton = await screen.findByRole('button', { name: 'Tout marquer comme lu (1)' });

    fireEvent.click(markAllButton);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/notifications/mark-all-read/');
    });
  });

  it('affiche un état vide lorsque le serveur ne renvoie aucune notification', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: [] });
    renderWithQueryClient(<NotificationsWidget />);

    expect(await screen.findByText('Aucune notification pour le moment.')).toBeInTheDocument();
  });
});
