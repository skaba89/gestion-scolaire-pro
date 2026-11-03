import { describe, expect, it } from 'vitest';

import { isCollected, paymentStatusLabel } from '../paymentStatus';

describe('paymentStatusLabel', () => {
  it("n'affiche « Encaissé » que pour un paiement COMPLETED", () => {
    expect(paymentStatusLabel('COMPLETED').label).toBe('Encaissé');
    for (const s of ['PENDING', 'FAILED', 'REFUNDED', 'REVERSED']) {
      expect(paymentStatusLabel(s).label).not.toBe('Encaissé');
    }
  });

  it('distingue attente, échec, remboursement et annulation (défaut « Validé » pour tous)', () => {
    expect(paymentStatusLabel('PENDING').label).toBe('En attente');
    expect(paymentStatusLabel('FAILED')).toEqual({ label: 'Échoué', variant: 'destructive' });
    expect(paymentStatusLabel('REFUNDED').label).toBe('Remboursé');
    expect(paymentStatusLabel('REVERSED')).toEqual({ label: 'Annulé', variant: 'destructive' });
  });

  it('montre une valeur inconnue telle quelle, sans la présenter comme encaissée', () => {
    expect(paymentStatusLabel('CHARGEBACK')).toEqual({ label: 'CHARGEBACK', variant: 'outline' });
    expect(paymentStatusLabel(null).label).toBe('-');
    expect(paymentStatusLabel('completed').label).toBe('Encaissé');
  });
});

describe('isCollected', () => {
  it('ne compte comme reçu que COMPLETED', () => {
    expect(isCollected('COMPLETED')).toBe(true);
    expect(isCollected('PENDING')).toBe(false);
    expect(isCollected(undefined)).toBe(false);
  });
});
