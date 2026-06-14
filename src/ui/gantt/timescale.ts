import { format, getISOWeek } from 'date-fns';
import { fr as frLocale } from 'date-fns/locale';
import { addDays, diffDays, mondayOf, toDate } from '@/core/calendar/dates';
import type { IsoDate, ZoomLevel } from '@/core/model/types';
import { t } from '@/i18n/fr';

export const ROW_HEIGHT = 21;
export const HEADER_HEIGHT = 34;

export const DAY_WIDTH: Record<ZoomLevel, number> = {
  day: 34,
  week: 14,
  month: 4.6,
  quarter: 2.1,
};

const PADDING_DAYS: Record<ZoomLevel, [number, number]> = {
  day: [7, 30],
  week: [14, 75],
  month: [30, 200],
  quarter: [60, 420],
};

export interface TimeScale {
  zoom: ZoomLevel;
  origin: IsoDate;
  end: IsoDate;
  dayWidth: number;
  totalDays: number;
  width: number;
  /** Bord gauche du jour. */
  x(date: IsoDate): number;
  /** Bord droit du jour (inclus). */
  xEnd(date: IsoDate): number;
  /** Jour sous l'abscisse. */
  dateAt(x: number): IsoDate;
}

export function buildTimeScale(
  span: { start: IsoDate; end: IsoDate } | null,
  zoom: ZoomLevel,
  today: IsoDate,
  extend?: { before: number; after: number },
): TimeScale {
  const [baseBefore, baseAfter] = PADDING_DAYS[zoom];
  const before = baseBefore + (extend?.before ?? 0);
  const after = baseAfter + (extend?.after ?? 0);
  const rawStart = span && span.start < today ? span.start : today;
  const rawEnd = span && span.end > today ? span.end : today;
  const origin = mondayOf(addDays(rawStart, -before));
  const end = addDays(rawEnd, after);
  const dayWidth = DAY_WIDTH[zoom];
  const totalDays = diffDays(origin, end) + 1;

  return {
    zoom,
    origin,
    end,
    dayWidth,
    totalDays,
    width: totalDays * dayWidth,
    x: (date) => diffDays(origin, date) * dayWidth,
    xEnd: (date) => (diffDays(origin, date) + 1) * dayWidth,
    dateAt: (px) => addDays(origin, Math.floor(px / dayWidth)),
  };
}

export interface HeaderTick {
  x: number;
  width: number;
  label: string;
  emphasis?: boolean;
  /** Estompé (week-end en zoom semaine). */
  faint?: boolean;
}

/** Rangée haute : mois (jour/semaine/mois) ou trimestres (quarter). */
export function topTicks(scale: TimeScale): HeaderTick[] {
  const out: HeaderTick[] = [];
  let day = scale.origin;
  if (scale.zoom === 'quarter') {
    while (day <= scale.end) {
      const d = toDate(day);
      const quarter = Math.floor(d.getMonth() / 3);
      const qStart = day;
      let cursor = day;
      while (cursor <= scale.end) {
        const cd = toDate(cursor);
        if (cd.getFullYear() !== d.getFullYear() || Math.floor(cd.getMonth() / 3) !== quarter)
          break;
        cursor = addDays(cursor, 1);
      }
      out.push({
        x: scale.x(qStart),
        width: scale.x(cursor) - scale.x(qStart),
        label: `T${quarter + 1} ${d.getFullYear()}`,
      });
      day = cursor;
    }
    return out;
  }
  while (day <= scale.end) {
    const d = toDate(day);
    let cursor = day;
    while (cursor <= scale.end) {
      const cd = toDate(cursor);
      if (cd.getMonth() !== d.getMonth() || cd.getFullYear() !== d.getFullYear()) break;
      cursor = addDays(cursor, 1);
    }
    out.push({
      x: scale.x(day),
      width: scale.x(cursor) - scale.x(day),
      label: format(d, scale.dayWidth >= 10 ? 'MMMM yyyy' : 'MMM yyyy', { locale: frLocale }),
    });
    day = cursor;
  }
  return out;
}

/** Rangée basse : jours (zoom jour), semaines (zoom semaine), mois (zoom mois/trimestre). */
export function bottomTicks(scale: TimeScale): HeaderTick[] {
  const out: HeaderTick[] = [];
  if (scale.zoom === 'day') {
    for (let day = scale.origin; day <= scale.end; day = addDays(day, 1)) {
      const d = toDate(day);
      out.push({
        x: scale.x(day),
        width: scale.dayWidth,
        label: format(d, 'd'),
        emphasis: d.getDay() === 1,
      });
    }
    return out;
  }
  if (scale.zoom === 'week') {
    // une lettre par jour : L M M J V S D — le n° de semaine s'affiche au survol
    for (let day = scale.origin; day <= scale.end; day = addDays(day, 1)) {
      const d = toDate(day);
      const dow = d.getDay();
      out.push({
        x: scale.x(day),
        width: scale.dayWidth,
        label: format(d, 'EEEEE', { locale: frLocale }).toUpperCase(),
        emphasis: dow === 1,
        faint: dow === 0 || dow === 6,
      });
    }
    return out;
  }
  if (scale.zoom === 'month') return out; // la rangée haute (mois) suffit
  return monthTicks(scale, out);
}

/** Zones cliquables par jour pour l'infobulle DD/MM/YYYY (zoom jour et semaine). */
export function dayHoverTicks(scale: TimeScale): { x: number; width: number; label: string }[] {
  if (scale.zoom !== 'day' && scale.zoom !== 'week') return [];
  const out: { x: number; width: number; label: string }[] = [];
  for (let day = scale.origin; day <= scale.end; day = addDays(day, 1)) {
    out.push({
      x: scale.x(day),
      width: scale.dayWidth,
      label: `${format(toDate(day), 'dd/MM/yyyy')} — S${getISOWeek(toDate(day))}`,
    });
  }
  return out;
}

/** Zones de survol par semaine (zoom semaine) : « S36 » en infobulle. */
export function weekHoverTicks(scale: TimeScale): HeaderTick[] {
  if (scale.zoom !== 'week') return [];
  const out: HeaderTick[] = [];
  for (let day = mondayOf(scale.origin); day <= scale.end; day = addDays(day, 7)) {
    out.push({
      x: scale.x(day),
      width: scale.dayWidth * 7,
      label: t('gantt.week', { num: getISOWeek(toDate(day)) }),
    });
  }
  return out;
}

function monthTicks(scale: TimeScale, out: HeaderTick[]): HeaderTick[] {
  // trimestre : graduations mensuelles fines
  let day = scale.origin;
  while (day <= scale.end) {
    const d = toDate(day);
    let cursor = day;
    while (cursor <= scale.end) {
      const cd = toDate(cursor);
      if (cd.getMonth() !== d.getMonth() || cd.getFullYear() !== d.getFullYear()) break;
      cursor = addDays(cursor, 1);
    }
    out.push({
      x: scale.x(day),
      width: scale.x(cursor) - scale.x(day),
      label: format(d, 'MMM', { locale: frLocale }),
    });
    day = cursor;
  }
  return out;
}
