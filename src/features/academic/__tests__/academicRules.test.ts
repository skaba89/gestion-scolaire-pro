import { describe, expect, it } from 'vitest';
import { cloneRules, firstRuleProblem, mentionBands, type AcademicRules } from '../academicRules';

const rules = (passing = 10, ab = 12, b = 14, tb = 16, ex = 18): AcademicRules => ({
  passing_grade: passing,
  mentions: [
    { label: 'Assez Bien', min: ab }, { label: 'Bien', min: b },
    { label: 'Très Bien', min: tb }, { label: 'Excellent', min: ex },
  ],
});

describe('firstRuleProblem (miroir de la validation serveur)', () => {
  it('accepte les valeurs habituelles et des seuils relevés', () => {
    expect(firstRuleProblem(rules())).toBeNull();
    expect(firstRuleProblem(rules(12, 13, 15, 17, 19))).toBeNull();
  });

  it('refuse un passage hors 0–20 et des seuils non croissants', () => {
    expect(firstRuleProblem(rules(0))?.key).toBe('academicRules.errPassing');
    expect(firstRuleProblem(rules(21))?.key).toBe('academicRules.errPassing');
    expect(firstRuleProblem(rules(10, 9))).toEqual({
      key: 'academicRules.errMention', values: { label: 'Assez Bien', previous: 10, max: 20 },
    });
    expect(firstRuleProblem(rules(10, 12, 12))?.values?.label).toBe('Bien');
  });
});

describe('mentionBands', () => {
  it('décrit les bandes affichées dans l’aperçu', () => {
    expect(mentionBands(rules())).toEqual([
      { label: 'Insuffisant', from: null, to: 10 },
      { label: 'Passable', from: 10, to: 12 },
      { label: 'Assez Bien', from: 12, to: 14 },
      { label: 'Bien', from: 14, to: 16 },
      { label: 'Très Bien', from: 16, to: 18 },
      { label: 'Excellent', from: 18, to: null },
    ]);
  });
});

it('cloneRules ne partage pas les mentions (édition sans effet de bord)', () => {
  const a = rules();
  const b = cloneRules(a);
  b.mentions[0].min = 13;
  expect(a.mentions[0].min).toBe(12);
});
