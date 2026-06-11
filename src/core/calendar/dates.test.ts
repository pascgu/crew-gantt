import { describe, expect, it } from 'vitest';
import {
  addDays,
  diffDays,
  eachDay,
  isBetween,
  maxIso,
  minIso,
  mondayOf,
  weekdayOf,
} from './dates';

describe('arithmétique de dates ISO', () => {
  it('addDays / diffDays', () => {
    expect(addDays('2026-06-11', 1)).toBe('2026-06-12');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-06-11', '2026-06-14')).toBe(3);
    expect(diffDays('2026-06-14', '2026-06-11')).toBe(-3);
  });

  it('weekdayOf (1 = lundi)', () => {
    expect(weekdayOf('2026-06-08')).toBe(1); // lundi
    expect(weekdayOf('2026-06-13')).toBe(6); // samedi
    expect(weekdayOf('2026-06-14')).toBe(7); // dimanche
  });

  it('mondayOf', () => {
    expect(mondayOf('2026-06-11')).toBe('2026-06-08');
    expect(mondayOf('2026-06-08')).toBe('2026-06-08');
    expect(mondayOf('2026-06-14')).toBe('2026-06-08');
  });

  it('min/max/isBetween', () => {
    expect(minIso('2026-01-02', '2026-01-10')).toBe('2026-01-02');
    expect(maxIso('2026-01-02', '2026-01-10')).toBe('2026-01-10');
    expect(isBetween('2026-01-05', '2026-01-02', '2026-01-10')).toBe(true);
    expect(isBetween('2026-01-05', '2026-01-06')).toBe(false);
    expect(isBetween('2026-01-05', '2026-01-05')).toBe(true); // to omis = ouvert
  });

  it('eachDay inclut les bornes', () => {
    expect([...eachDay('2026-06-11', '2026-06-13')]).toEqual([
      '2026-06-11',
      '2026-06-12',
      '2026-06-13',
    ]);
    expect([...eachDay('2026-06-11', '2026-06-10')]).toEqual([]);
  });
});
