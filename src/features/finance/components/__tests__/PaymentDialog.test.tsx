import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/api/client';
import { PaymentDialog } from '../PaymentDialog';

vi.mock('@/api/client', () => ({
  apiClient: { post: vi.fn() },
}));

vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => ({ formatCurrency: (value: number) => `${value} GNF` }),
}));

vi.mock('@/hooks/useStudentLabel', () => ({
  useStudentLabel: () => ({ StudentLabel: 'Étudiant' }),
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, onValueChange, value }: any) => (
    <select value={value} onChange={(event) => onValueChange(event.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
}));

const invoice = {
  id: '4e7145a8-4533-4a74-9b27-39830fb51a25',
  invoice_number: 'FAC-2026-001',
  total_amount: 50000,
  paid_amount: 0,
  students: { first_name: 'Aïssatou', last_name: 'Diallo' },
} as any;

function renderDialog(onSave = vi.fn(), onOpenChange = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PaymentDialog
        open
        onOpenChange={onOpenChange}
        invoice={invoice}
        onSave={onSave}
        isSaving={false}
        nextReference="PAY-001"
      />
    </QueryClientProvider>,
  );
  return { onSave, onOpenChange };
}

describe('PaymentDialog Mobile Money', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'open').mockImplementation(() => null);
    vi.mocked(apiClient.post).mockResolvedValue({
      data: {
        payment_url: 'https://checkout.cinetpay.com/payment/test',
        transaction_reference: 'CP-TEST',
        message: 'Paiement initié',
      },
    });
  });

  it('redirige vers la passerelle sans enregistrer un paiement avant le webhook', async () => {
    const user = userEvent.setup();
    const { onSave, onOpenChange } = renderDialog();

    await user.selectOptions(screen.getByRole('combobox'), 'mobile_money');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/payments/intent/', null, {
        params: {
          amount: 50000,
          method: 'MOBILE_MONEY',
          invoice_id: invoice.id,
        },
      });
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(window.open).toHaveBeenCalledWith(
      'https://checkout.cinetpay.com/payment/test',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('refuse une URL de paiement non sécurisée', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: { payment_url: 'http://gateway.invalid/payment/test' },
    });
    const user = userEvent.setup();
    const { onSave, onOpenChange } = renderDialog();

    await user.selectOptions(screen.getByRole('combobox'), 'mobile_money');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(onSave).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });
});
