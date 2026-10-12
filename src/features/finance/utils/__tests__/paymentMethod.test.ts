import { describe, expect, it } from 'vitest';

import { paymentMethodLabel } from '../paymentMethod';

describe('paymentMethodLabel', () => {
  it('traduit les méthodes renvoyées en majuscules par l\'API', () => {
    expect(paymentMethodLabel('CASH')).toBe('Espèces');
    expect(paymentMethodLabel('MOBILE_MONEY')).toBe('Mobile Money');
    expect(paymentMethodLabel('BANK_TRANSFER')).toBe('Virement');
    expect(paymentMethodLabel('CHECK')).toBe('Chèque');
  });

  it('accepte aussi les minuscules et garde une valeur inconnue telle quelle', () => {
    expect(paymentMethodLabel('cash')).toBe('Espèces');
    expect(paymentMethodLabel('CINETPAY')).toBe('CINETPAY');
    expect(paymentMethodLabel(null)).toBe('-');
  });
});
