import type { IsoDate } from '../model/types';
import { addDays, toIso } from './dates';

/** Dimanche de Pâques (algorithme de Meeus/Butcher). */
export function easterSunday(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toIso(new Date(year, month - 1, day));
}

/** Jours fériés français (métropole) d'une année. */
export function frenchHolidays(year: number): IsoDate[] {
  const fixed: IsoDate[] = [
    `${year}-01-01`, // Jour de l'an
    `${year}-05-01`, // Fête du travail
    `${year}-05-08`, // Victoire 1945
    `${year}-07-14`, // Fête nationale
    `${year}-08-15`, // Assomption
    `${year}-11-01`, // Toussaint
    `${year}-11-11`, // Armistice
    `${year}-12-25`, // Noël
  ];
  const easter = easterSunday(year);
  const mobile = [addDays(easter, 1), addDays(easter, 39), addDays(easter, 50)];
  return [...fixed, ...mobile].sort();
}

/** Fériés français sur une plage d'années (incluses). */
export function frenchHolidaysRange(fromYear: number, toYear: number): IsoDate[] {
  const out: IsoDate[] = [];
  for (let y = fromYear; y <= toYear; y++) out.push(...frenchHolidays(y));
  return out.sort();
}
