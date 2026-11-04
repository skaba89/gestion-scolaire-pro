import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const get = vi.fn();
vi.mock('@/api/client', () => ({ apiClient: { get: (...a: unknown[]) => get(...a) } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));

import { TypingIndicator } from '../TypingIndicator';

const renderIt = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TypingIndicator conversationId="c1" />
    </QueryClientProvider>,
  );

beforeEach(() => get.mockReset());

describe('TypingIndicator', () => {
  it('interroge la seule route « typing » de la conversation et affiche le prénom', async () => {
    get.mockResolvedValue({ data: [{ user_id: 'u2', first_name: 'Boubacar' }] });
    renderIt();
    expect(await screen.findByText("Boubacar est en train d'écrire...")).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/communication/conversations/c1/typing/');
  });

  it("n'affiche rien quand personne n'écrit (ni moi-même)", async () => {
    get.mockResolvedValue({ data: [{ user_id: 'me', first_name: 'Moi' }] });
    const { container } = renderIt();
    await vi.waitFor(() => expect(get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
