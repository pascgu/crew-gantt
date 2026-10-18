import { format } from 'date-fns';
import { toDate } from '@/core/calendar/dates';
import type { CalcContext } from '@/core/scheduler/context';
import type { IsoDate, Project, Task } from '@/core/model/types';

/** Couleur d'affichage d'une tâche/jalon : couleur propre sinon couleur du projet. */
export function taskColor(task: Pick<Task, 'color' | 'projectId'>, projects: Project[]): string {
  return task.color ?? projects.find((p) => p.id === task.projectId)?.color ?? '#888888';
}

export type DateFormat = 'DD/MM/YYYY' | 'YYYY-MM-DD';

/**
 * Format des dates choisi dans Paramètres (préférence locale), appliqué à tous les affichages de
 * dates de l'interface. Posé par le store des préférences ; l'app remonte l'onglet courant quand il
 * change (cf. App) pour que tout se redessine.
 */
let currentDateFormat: DateFormat = 'DD/MM/YYYY';

export function setCurrentDateFormat(fmt: DateFormat): void {
  currentDateFormat = fmt;
}

/** Date courte : « 21/10 » ou « 10-21 » (AAAA-MM-JJ sans l'année). */
export function fmtDay(iso: IsoDate | null | undefined): string {
  if (!iso) return '—';
  return format(toDate(iso), currentDateFormat === 'DD/MM/YYYY' ? 'dd/MM' : 'MM-dd');
}

/** Date complète : « 21/10/2026 » ou « 2026-10-21 ». */
export function fmtDayFull(iso: IsoDate | null | undefined): string {
  return fmtDate(iso, currentDateFormat);
}

export function fmtDate(iso: IsoDate | null | undefined, fmt: DateFormat): string {
  if (!iso) return '—';
  return format(toDate(iso), fmt === 'DD/MM/YYYY' ? 'dd/MM/yyyy' : 'yyyy-MM-dd');
}

/** j-h affichés : une décimale, virgule française (« 10,4 »). */
export function fmtDays(value: number): string {
  return fmtNum(value, 1);
}

/** Nombre à la française : au plus `decimals` décimales, sans zéros inutiles, virgule (« 6,56 »). */
export function fmtNum(value: number, decimals = 2): string {
  const f = 10 ** decimals;
  return `${Math.round(value * f) / f}`.replace('.', ',');
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
