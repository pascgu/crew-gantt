import type { Block, IsoDate, Task } from '../model/types';
import { addDays } from '../calendar/dates';
import type { CalcContext } from './context';

/** Horizon de calcul : au-delà, l'effort est déclaré « non casé ». */
const HORIZON_DAYS = 1200;

const EPS = 1e-9;

export interface ResolvedBlock {
  readonly block: Block;
  readonly from: IsoDate;
  /** Fin résolue (jamais null) — pour un bloc ouvert sans capacité : `from`. */
  readonly to: IsoDate;
  /** true si la fin vient du calcul (bloc ouvert, mode effort). */
  readonly computed: boolean;
  /** true si le reste à faire n'a pas pu être absorbé dans l'horizon. */
  readonly overflow: boolean;
}

/** Capacité totale d'un bloc un jour donné (somme des affectations), en j-h. */
export function blockCapacityOnDay(
  ctx: CalcContext,
  task: Task,
  block: Block,
  day: IsoDate,
): number {
  let total = 0;
  for (const a of block.assignments) {
    total += ctx.assignmentCapacity(a.resourceId, task.projectId, a.units, day);
  }
  return total;
}

/**
 * Résout les blocs d'une tâche : les blocs fermés sont pris tels quels,
 * le bloc ouvert (`to: null`, mode effort) absorbe le reste à faire — sa fin
 * est le jour où la somme des capacités a consommé `remaining`.
 *
 * Un bloc fermé est soit de l'historique (jours avant `today`, travail déjà
 * déduit du reste), soit un découpage volontaire à venir : sa capacité future
 * est alors retranchée de ce que le bloc ouvert doit absorber.
 */
export function resolveBlocks(ctx: CalcContext, task: Task): ResolvedBlock[] {
  let futurePlanned = 0;
  for (const block of task.blocks) {
    if (block.to !== null) {
      futurePlanned += plannedFutureCapacity(ctx, task, block);
    }
  }
  return task.blocks.map((block) => {
    if (block.to !== null) {
      return { block, from: block.from, to: block.to, computed: false, overflow: false };
    }
    if (task.scheduling === 'fixed') {
      // En mode fixed les dates sont posées à la main ; un bloc ouvert se réduit à sa date de début.
      return { block, from: block.from, to: block.from, computed: true, overflow: false };
    }
    const toAbsorb = Math.max(0, task.remaining - futurePlanned);
    const end = consumeRemaining(ctx, task, block, toAbsorb);
    if (end === null) {
      return { block, from: block.from, to: block.from, computed: true, overflow: true };
    }
    return { block, from: block.from, to: end, computed: true, overflow: false };
  });
}

/** Capacité d'un bloc fermé sur ses seuls jours ≥ today (travail encore à venir). */
export function plannedFutureCapacity(ctx: CalcContext, task: Task, block: Block): number {
  if (block.to === null) return 0;
  const start = block.from >= ctx.today ? block.from : ctx.today;
  let total = 0;
  for (let day = start; day <= block.to; day = addDays(day, 1)) {
    total += blockCapacityOnDay(ctx, task, block, day);
  }
  return total;
}

/**
 * Fin du bloc ouvert : premier jour où le cumul des capacités atteint `remaining`.
 * null si l'horizon est dépassé (aucune capacité suffisante).
 */
function consumeRemaining(
  ctx: CalcContext,
  task: Task,
  block: Block,
  remaining: number,
): IsoDate | null {
  if (remaining <= EPS) return block.from;
  if (block.assignments.length === 0) return null;
  let cumulative = 0;
  let day = block.from;
  for (let i = 0; i < HORIZON_DAYS; i++) {
    cumulative += blockCapacityOnDay(ctx, task, block, day);
    if (cumulative >= remaining - EPS) return day;
    day = addDays(day, 1);
  }
  return null;
}

/** Capacité totale (j-h) d'un bloc fermé sur toute sa durée. */
export function closedBlockCapacity(ctx: CalcContext, task: Task, resolved: ResolvedBlock): number {
  let total = 0;
  let day = resolved.from;
  while (day <= resolved.to) {
    total += blockCapacityOnDay(ctx, task, resolved.block, day);
    day = addDays(day, 1);
  }
  return total;
}

export interface TaskSpan {
  start: IsoDate;
  end: IsoDate;
}

/** Étendue calendaire d'une tâche (du début du premier bloc à la fin du dernier). */
export function taskSpan(resolved: ResolvedBlock[]): TaskSpan | null {
  if (resolved.length === 0) return null;
  let start = resolved[0]!.from;
  let end = resolved[0]!.to;
  for (const r of resolved) {
    if (r.from < start) start = r.from;
    if (r.to > end) end = r.to;
  }
  return { start, end };
}
