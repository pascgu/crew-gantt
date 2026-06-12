import type { IsoDate, Weekday } from '../model/types';

/**
 * Arithmétique de dates ISO `"YYYY-MM-DD"` en jours d'époque purs — le chemin
 * chaud du moteur (appelé des dizaines de milliers de fois par recalcul).
 * Le formatage localisé reste à date-fns, côté UI.
 */

const MS_PER_DAY = 86_400_000;

/** Jours écoulés depuis l'époque Unix (UTC) pour une date ISO. */
function toEpochDays(iso: IsoDate): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

function fromEpochDays(days: number): IsoDate {
  const date = new Date(days * MS_PER_DAY);
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  return `${y}-${m < 10 ? '0' : ''}${m}-${d < 10 ? '0' : ''}${d}`;
}

export function toDate(iso: IsoDate): Date {
  return new Date(`${iso}T00:00:00`);
}

export function toIso(date: Date): IsoDate {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${y}-${m < 10 ? '0' : ''}${m}-${d < 10 ? '0' : ''}${d}`;
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return fromEpochDays(toEpochDays(iso) + days);
}

/** Nombre de jours calendaires de `a` à `b` (positif si b > a). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return toEpochDays(b) - toEpochDays(a);
}

/** Jour de semaine ISO : 1 = lundi … 7 = dimanche. (01/01/1970 = jeudi) */
export function weekdayOf(iso: IsoDate): Weekday {
  return ((((toEpochDays(iso) + 3) % 7) + 7) % 7 + 1) as Weekday;
}

export function mondayOf(iso: IsoDate): IsoDate {
  return addDays(iso, 1 - weekdayOf(iso));
}

export function minIso(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

export function maxIso(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

/** Compare deux dates ISO (ordre lexicographique = ordre chronologique). */
export function isBetween(iso: IsoDate, from: IsoDate, to?: IsoDate): boolean {
  return iso >= from && (to === undefined || iso <= to);
}

export function todayIso(): IsoDate {
  return toIso(new Date());
}

/** Itère de `from` à `to` inclus. */
export function* eachDay(from: IsoDate, to: IsoDate): Generator<IsoDate> {
  const end = toEpochDays(to);
  for (let d = toEpochDays(from); d <= end; d++) {
    yield fromEpochDays(d);
  }
}
