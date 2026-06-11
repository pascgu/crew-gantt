import { describe, expect, it } from 'vitest';
import { easterSunday, frenchHolidays, frenchHolidaysRange } from './frenchHolidays';

describe('easterSunday', () => {
  it('calcule Pâques sur des années connues', () => {
    expect(easterSunday(2024)).toBe('2024-03-31');
    expect(easterSunday(2025)).toBe('2025-04-20');
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
  });
});

describe('frenchHolidays', () => {
  it('liste les 11 fériés de 2026', () => {
    const holidays = frenchHolidays(2026);
    expect(holidays).toHaveLength(11);
    expect(holidays).toContain('2026-01-01'); // Jour de l'an
    expect(holidays).toContain('2026-04-06'); // Lundi de Pâques
    expect(holidays).toContain('2026-05-14'); // Ascension
    expect(holidays).toContain('2026-05-25'); // Lundi de Pentecôte
    expect(holidays).toContain('2026-07-14');
    expect(holidays).toContain('2026-12-25');
  });

  it('est triée et couvre une plage', () => {
    const range = frenchHolidaysRange(2025, 2026);
    expect(range).toHaveLength(22);
    expect([...range].sort()).toEqual(range);
  });
});
