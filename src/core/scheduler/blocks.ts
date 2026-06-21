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
  if (block.zero) return 0; // bloc « 0 jour » : aucune capacité
  let total = 0;
  for (const a of block.assignments) {
    total += ctx.assignmentCapacity(a.resourceId, task.projectId, a.units, day);
  }
  return total;
}

/**
 * Source unique de vérité pour la capacité effort d'un bloc un jour donné.
 * Bloc sans affectation = 1 personne à 100 % (1 j-h / jour ouvré global).
 * Bloc affecté = somme des affectations (peut être 0 si toutes à 0 %).
 */
export function effortCapacityOnDay(
  ctx: CalcContext,
  task: Task,
  block: Block,
  day: IsoDate,
): number {
  if (block.zero) return 0; // bloc « 0 jour » : aucune capacité
  if (block.assignments.length > 0) return blockCapacityOnDay(ctx, task, block, day);
  return ctx.isGlobalWorkingDay(day) ? 1 : 0;
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
    total += effortCapacityOnDay(ctx, task, block, day);
  }
  return total;
}

/**
 * Fin du bloc ouvert : premier jour où le cumul des capacités atteint `remaining`.
 * Le décompte commence au plus tôt à ctx.today (trait de revue) si le bloc a déjà démarré.
 * null si l'horizon est dépassé (aucune capacité suffisante).
 */
function consumeRemaining(
  ctx: CalcContext,
  task: Task,
  block: Block,
  remaining: number,
): IsoDate | null {
  const effectiveStart = block.from >= ctx.today ? block.from : ctx.today;
  if (remaining <= EPS) return effectiveStart;
  let cumulative = 0;
  let day = effectiveStart;
  for (let i = 0; i < HORIZON_DAYS; i++) {
    cumulative += effortCapacityOnDay(ctx, task, block, day);
    if (cumulative >= remaining - EPS) return day;
    day = addDays(day, 1);
  }
  return null;
}

/**
 * Réalisé géométrique (j-h) = somme des capacités sur tous les jours de blocs **strictement avant
 * le trait de revue** (`ctx.today`). C'est le passé figé : sert au resync du reste et à l'affichage
 * du Réalisé. Tâche pas encore commencée → 0.
 */
export function realizedBeforeReview(ctx: CalcContext, task: Task): number {
  let total = 0;
  for (const block of task.blocks) {
    let day = block.from;
    while (day < ctx.today && (block.to === null || day <= block.to)) {
      total += effortCapacityOnDay(ctx, task, block, day);
      day = addDays(day, 1);
    }
  }
  return total;
}

/**
 * Réalisé affiché (j-h). Tâche effort : `effort − reste` (pivot maintenu, l'arithmétique
 * Effort = Réalisé + Reste est exacte). Tâche fixed : réalisé géométrique des dates posées.
 */
export function realizedOf(ctx: CalcContext, task: Task): number {
  if (task.scheduling === 'effort') return Math.max(0, task.effort - task.remaining);
  return realizedBeforeReview(ctx, task);
}

/**
 * Reste à faire affiché (j-h) — source unique pour panneau, liste, infobulle, label.
 * Tâche effort : le champ piloté `remaining`. Tâche fixed : capacité restante des
 * dates posées (`effort planifié − réalisé`), donc 0 si les blocs tombent sur des
 * jours non travaillés (férié/week-end).
 */
export function remainingOf(ctx: CalcContext, task: Task, resolved: ResolvedBlock[]): number {
  if (task.scheduling === 'effort') return task.remaining;
  return Math.max(0, scheduledEffort(ctx, task, resolved) - realizedOf(ctx, task));
}

/** Effort affiché d'une tâche fixed (j-h) = capacité totale des dates posées. */
export function scheduledEffort(ctx: CalcContext, task: Task, resolved: ResolvedBlock[]): number {
  let total = 0;
  for (const r of resolved) total += closedBlockCapacity(ctx, task, r);
  return total;
}

/** Capacité totale (j-h) d'un bloc fermé sur toute sa durée. */
export function closedBlockCapacity(ctx: CalcContext, task: Task, resolved: ResolvedBlock): number {
  let total = 0;
  let day = resolved.from;
  while (day <= resolved.to) {
    total += effortCapacityOnDay(ctx, task, resolved.block, day);
    day = addDays(day, 1);
  }
  return total;
}

/**
 * Calcule le `remaining` à poser pour que `openBlockId` se termine exactement sur `endDay`.
 * `fromOverride` permet de surcharger le début du bloc (geste resize-start : on veut
 * garder la fin fixe et ajuster le reste en déplaçant le début).
 * Garantit l'aller-retour : tirer la fin (ou déplacer le début) → fin = endDay.
 */
export function remainingForEndDate(
  ctx: CalcContext,
  task: Task,
  openBlockId: string,
  endDay: IsoDate,
  fromOverride?: IsoDate,
): number {
  const openBlock = task.blocks.find((b) => b.id === openBlockId);
  if (!openBlock) return task.remaining;
  const fromDay = fromOverride ?? openBlock.from;

  // Capacité des blocs fermés à venir, hors le bloc redimensionné (déduits dans resolveBlocks)
  let futureClosed = 0;
  for (const block of task.blocks) {
    if (block.id !== openBlockId && block.to !== null) {
      futureClosed += plannedFutureCapacity(ctx, task, block);
    }
  }

  // Capacité du bloc depuis max(fromDay, ctx.today) jusqu'à endDay
  const effectiveStart = fromDay >= ctx.today ? fromDay : ctx.today;
  let openCapacity = 0;
  for (let d = effectiveStart; d <= endDay; d = addDays(d, 1)) {
    openCapacity += effortCapacityOnDay(ctx, task, openBlock, d);
  }

  return Math.round((futureClosed + openCapacity) * 100) / 100;
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
