import {
  addDays as dfAddDays,
  differenceInCalendarDays,
  format,
  getISODay,
  parseISO,
  startOfWeek,
} from 'date-fns';
import type { IsoDate, Weekday } from '../model/types';

export function toDate(iso: IsoDate): Date {
  return parseISO(iso);
}

export function toIso(date: Date): IsoDate {
  return format(date, 'yyyy-MM-dd');
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return toIso(dfAddDays(toDate(iso), days));
}

/** Nombre de jours calendaires de `a` à `b` (positif si b > a). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return differenceInCalendarDays(toDate(b), toDate(a));
}

/** Jour de semaine ISO : 1 = lundi … 7 = dimanche. */
export function weekdayOf(iso: IsoDate): Weekday {
  return getISODay(toDate(iso)) as Weekday;
}

export function mondayOf(iso: IsoDate): IsoDate {
  return toIso(startOfWeek(toDate(iso), { weekStartsOn: 1 }));
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
  let d = from;
  while (d <= to) {
    yield d;
    d = addDays(d, 1);
  }
}
