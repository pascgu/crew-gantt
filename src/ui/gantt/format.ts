import { format } from 'date-fns';
import { toDate } from '@/core/calendar/dates';
import type { CalcContext } from '@/core/scheduler/context';
import type { IsoDate, Project, Task } from '@/core/model/types';

/** Couleur d'affichage d'une tâche/jalon : couleur propre sinon couleur du projet. */
export function taskColor(task: Pick<Task, 'color' | 'projectId'>, projects: Project[]): string {
  return task.color ?? projects.find((p) => p.id === task.projectId)?.color ?? '#888888';
}

export function fmtDay(iso: IsoDate | null | undefined): string {
  if (!iso) return '—';
  return format(toDate(iso), 'dd/MM');
}

export function fmtDayFull(iso: IsoDate | null | undefined): string {
  if (!iso) return '—';
  return format(toDate(iso), 'dd/MM/yyyy');
}

export type DateFormat = 'DD/MM/YYYY' | 'YYYY-MM-DD';

export function fmtDate(iso: IsoDate | null | undefined, fmt: DateFormat): string {
  if (!iso) return '—';
  return format(toDate(iso), fmt === 'DD/MM/YYYY' ? 'dd/MM/yyyy' : 'yyyy-MM-dd');
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
