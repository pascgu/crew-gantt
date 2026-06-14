import type { IsoDate } from '../model/types';
import { addDays, eachDay } from '../calendar/dates';
import type { CalcContext } from './context';
import type { ResolvedBlock } from './blocks';
import type { Hierarchy } from './hierarchy';

export interface DayLoad {
  /** Charge en j-h par projet (capacités réelles : présence × part × units). */
  perProject: Record<string, number>;
  /** Σ des units (%) par projet — sert à détecter la surcharge projet (> 100). */
  unitsByProject: Record<string, number>;
  /** Charge totale en j-h, tous projets. */
  total: number;
}

export type LoadIndex = Map<string, Map<IsoDate, DayLoad>>;

/**
 * Charge par ressource et par jour, construite en un passage sur tous les
 * blocs résolus. Seuls les jours ouvrés globaux portent du travail.
 */
export function buildLoadIndex(
  ctx: CalcContext,
  hierarchy: Hierarchy,
  resolvedByTask: ReadonlyMap<string, ResolvedBlock[]>,
): LoadIndex {
  const index: LoadIndex = new Map();

  for (const [taskId, resolved] of resolvedByTask) {
    const task = hierarchy.tasksById.get(taskId);
    if (!task || task.type !== 'task') continue;
    if (task.status === 'cancelled') continue;
    for (const r of resolved) {
      for (const assignment of r.block.assignments) {
        let perResource = index.get(assignment.resourceId);
        if (!perResource) {
          perResource = new Map();
          index.set(assignment.resourceId, perResource);
        }
        for (const day of eachDay(r.from, r.to)) {
          if (!ctx.isGlobalWorkingDay(day)) continue;
          if (ctx.presence(assignment.resourceId, day) <= 0) continue;
          let load = perResource.get(day);
          if (!load) {
            load = { perProject: {}, unitsByProject: {}, total: 0 };
            perResource.set(day, load);
          }
          const capacity = ctx.assignmentCapacity(
            assignment.resourceId,
            task.projectId,
            assignment.units,
            day,
          );
          load.perProject[task.projectId] =
            (load.perProject[task.projectId] ?? 0) + capacity;
          load.unitsByProject[task.projectId] =
            (load.unitsByProject[task.projectId] ?? 0) + assignment.units;
          load.total += capacity;
        }
      }
    }
  }
  return index;
}

/**
 * Capacité libre d'une ressource sur une fenêtre : Σ par jour de
 * max(0, présence − charge totale). Sert au tri de l'aide à l'affectation.
 */
export function freeCapacity(
  ctx: CalcContext,
  index: LoadIndex,
  resourceId: string,
  from: IsoDate,
  to: IsoDate,
): { free: number; presenceTotal: number } {
  const days = index.get(resourceId);
  let free = 0;
  let presenceTotal = 0;
  for (const day of eachDay(from, to)) {
    if (!ctx.isGlobalWorkingDay(day)) continue;
    const presence = ctx.presence(resourceId, day);
    if (presence <= 0) continue;
    presenceTotal += presence;
    const load = days?.get(day)?.total ?? 0;
    free += Math.max(0, presence - load);
  }
  return { free: Math.round(free * 100) / 100, presenceTotal };
}

export interface OverEngagement {
  resourceId: string;
  from: IsoDate;
  to: IsoDate;
  /** Pic de charge sur la période, en j-h (à comparer à la présence ≤ 1). */
  peak: number;
}

/**
 * Sur-engagement : charge totale d'une personne au-delà de sa présence du jour.
 * Ce n'est PAS un conflit rouge (heures supp assumées) — avertissement doux.
 * Les jours consécutifs sont regroupés en périodes.
 */
export function findOverEngagements(ctx: CalcContext, index: LoadIndex): OverEngagement[] {
  const out: OverEngagement[] = [];
  for (const [resourceId, days] of index) {
    const overDays = [...days.entries()]
      .filter(([day, load]) => load.total > ctx.presence(resourceId, day) + 1e-9)
      .sort(([a], [b]) => a.localeCompare(b));

    let current: OverEngagement | null = null;
    for (const [day, load] of overDays) {
      if (current && day <= addDays(current.to, 3)) {
        // tolérance week-end : on regroupe à 3 jours près
        current.to = day;
        current.peak = Math.max(current.peak, load.total);
      } else {
        if (current) out.push(current);
        current = { resourceId, from: day, to: day, peak: load.total };
      }
    }
    if (current) out.push(current);
  }
  return out;
}
