import { describe, expect, it } from 'vitest';

import { apiErrorDetail } from '../api-error';

describe('apiErrorDetail', () => {
  it('renvoie le detail texte de l\'API', () => {
    expect(apiErrorDetail({ response: { data: { detail: 'Matricule déjà utilisé' } } })).toBe('Matricule déjà utilisé');
  });

  it('lit une liste d\'erreurs de validation (422) au lieu de « [object Object] »', () => {
    const error = { response: { data: { detail: [{ msg: 'email invalide' }, { msg: 'date invalide' }] } } };
    expect(apiErrorDetail(error)).toBe('email invalide ; date invalide');
  });

  it('se rabat sur le message de l\'erreur', () => {
    expect(apiErrorDetail(new Error('Network Error'))).toBe('Network Error');
    expect(apiErrorDetail(null)).toBe('Erreur inconnue');
  });
});
