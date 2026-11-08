import { describe, expect, it } from 'vitest';
import { surveyDateInputValue } from './survey-dates';

describe('surveyDateInputValue', () => {
  it.each([
    ['2026-11-08', '2026-11-08'],
    ['2026-11-08T13:45:00', '2026-11-08'],
    ['2026-11-08T13:45:00Z', '2026-11-08'],
    ['2026-11-08 13:45:00', '2026-11-08'],
    ['', ''],
    [null, ''],
    [undefined, ''],
    ['invalid', ''],
  ])('converts %s to %s for date inputs', (input, expected) => {
    expect(surveyDateInputValue(input)).toBe(expected);
  });
});
