import { describe, expect, it } from 'vitest';

import { normalizeGender } from '../gender';

describe('normalizeGender', () => {
  it.each([
    ['MALE', 'male'], ['FEMALE', 'female'], ['OTHER', 'other'],
    ['male', 'male'], ['M', 'male'], ['H', 'male'], ['Masculin', 'male'],
    ['female', 'female'], ['F', 'female'], ['Féminin', 'female'], ['fille', 'female'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeGender(input)).toBe(expected);
  });

  it('renvoie null pour une valeur vide ou inconnue', () => {
    expect(normalizeGender(undefined)).toBeNull();
    expect(normalizeGender('')).toBeNull();
    expect(normalizeGender('X')).toBeNull();
  });

  it('ne confond plus MALE avec « Fille » (bug de la fiche classe)', () => {
    // ClassDetailModal comparait à 'male' : l'API renvoyant 'MALE', tous les
    // garçons s'affichaient « Fille ».
    expect(normalizeGender('MALE')).not.toBe('female');
  });
});
