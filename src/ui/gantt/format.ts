import { format } from 'date-fns';
import { toDate } from '@/core/calendar/dates';
import type { CalcContext } from '@/core/scheduler/context';
import type { IsoDate } from '@/core/model/types';

export function fmtDay(iso: IsoDate | null | undefined): string {
  if (!iso) return '—';
  return format(toDate(iso), 'dd/MM');
}

export function fmtDayFull(iso: IsoDate | null | undefined): string {
  if (!iso) return '—';
  return format(toDate(iso), 'dd/MM/yyyy');
}

export function fmtDays(value: number): string {
  return `${Math.round(value * 10) / 10}`.replace('.', ',');
}

/**
 * Règle d'or d'affichage : tout % est accompagné de son équivalent concret en
 * jours/semaine — présence hebdo (motif) × part projet × units.
 */
export function weeklyEquivalent(
  ctx: CalcContext,
  resourceId: string,
  projectId: string,
  units: number,
  refDate: IsoDate,
): number {
  const resource = ctx.resourcesById.get(resourceId);
  if (!resource) return 0;
  const pattern = resource.workingDays ?? ctx.file.team.calendar.workingDays;
  const share = ctx.projectShare(resourceId, projectId, refDate);
  return Math.round(pattern.length * share * (units / 100) * 10) / 10;
}

export function initials(name: string): string {
  return name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}
