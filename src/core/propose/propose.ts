import { addDays, diffDays, maxIso } from '../calendar/dates';
import { newId } from '../model/factory';
import type { Assignment, Block, IsoDate, Task, TeamFile } from '../model/types';
import { createCalcContext, type CalcContext } from '../scheduler/context';
import {
  plannedFutureCapacity,
  resolveBlocks,
  taskSpan,
  type ResolvedBlock,
} from '../scheduler/blocks';
import { buildHierarchy } from '../scheduler/hierarchy';
import { aggregateGroup } from '../scheduler/groups';
import { earliestStart, topologicalOrder, type LinkInputs } from '../scheduler/links';

const HORIZON_DAYS = 1200;
const EPS = 1e-9;

export interface TaskChange {
  taskId: string;
  /** Nouveau jeu de blocs complet (tâches). */
  blocks?: Block[];
  /** Nouvelle date (jalons). */
  date?: IsoDate;
  // — pour le panneau Impacts —
  oldStart: IsoDate | null;
  newStart: IsoDate | null;
  oldEnd: IsoDate | null;
  newEnd: IsoDate | null;
  oldBlockCount: number;
  newBlockCount: number;
}

export interface Proposal {
  changes: TaskChange[];
  /** Deadlines encore menacées dans le plan proposé. */
  threatenedDeadlines: { taskId: string; deadline: IsoDate; end: IsoDate }[];
}

/**
 * Plan proposé : placement au plus tôt respectant liens et capacités, en
 * découpant les blocs autour des périodes sans capacité (absences datées).
 *
 * Principes :
 * - on ne tire jamais une tâche en avant (la marge libre est normale) ;
 * - les blocs passés (et la part passée d'un bloc à cheval) restent intacts ;
 * - les tâches en mode fixed et les tâches terminées ne bougent pas ;
 * - cascade : un prédécesseur poussé pousse ses successeurs (ordre topologique).
 *
 * Retourne null si rien à proposer (plan déjà stable) ou si le graphe a un cycle.
 */
export function proposePlan(file: TeamFile, today: IsoDate): Proposal | null {
  const { order } = topologicalOrder(file.tasks);
  if (!order) return null;

  const ctx = createCalcContext(file, today);
  const hierarchy = buildHierarchy(file.tasks);
  const tasksById = hierarchy.tasksById;

  // État de travail : blocs résolus, mis à jour au fil des propositions.
  const resolvedByTask = new Map<string, ResolvedBlock[]>();
  for (const task of file.tasks) {
    if (task.type === 'task') resolvedByTask.set(task.id, resolveBlocks(ctx, task));
  }
  const groupAggByTask = new Map(
    file.tasks
      .filter((t) => t.type === 'group')
      .map((t) => [t.id, aggregateGroup(ctx, hierarchy.descendantsOf(t.id), resolvedByTask)] as const),
  );
  const inputs: LinkInputs = { ctx, hierarchy, resolvedByTask, groupAggByTask };

  const refreshGroups = () => {
    for (const t of file.tasks) {
      if (t.type === 'group') {
        groupAggByTask.set(t.id, aggregateGroup(ctx, hierarchy.descendantsOf(t.id), resolvedByTask));
      }
    }
  };

  const changes: TaskChange[] = [];
  // Tâches re-bloquées pendant la proposition (pour earliestStart en cascade).
  const reblocked = new Map<string, Task>();

  const taskFor = (id: string): Task => reblocked.get(id) ?? tasksById.get(id)!;

  for (const taskId of order) {
    const task = taskFor(taskId);
    if (!task) continue;

    if (task.type === 'milestone') {
      if (!task.date) continue;
      const earliest = earliestStart(inputs, task).date;
      if (earliest && task.date < earliest) {
        changes.push({
          taskId,
          date: earliest,
          oldStart: task.date,
          newStart: earliest,
          oldEnd: task.date,
          newEnd: earliest,
          oldBlockCount: 0,
          newBlockCount: 0,
        });
        // un jalon déplacé peut contraindre des successeurs : reflète sa nouvelle date
        reblocked.set(taskId, { ...task, date: earliest });
        hierarchyPatch(tasksById, taskId, reblocked.get(taskId)!);
      }
      continue;
    }

    if (task.type !== 'task' || task.scheduling === 'fixed' || task.status === 'done' || task.status === 'cancelled') continue;
    if (task.blocks.length === 0 || task.remaining <= EPS) continue;

    const resolved = resolvedByTask.get(taskId) ?? [];
    const proposed = placeTask(ctx, inputs, task, resolved, today);
    if (!proposed) continue;

    const oldSpan = taskSpan(resolved);
    const newTask = { ...taskFor(taskId), blocks: proposed };
    reblocked.set(taskId, newTask);
    hierarchyPatch(tasksById, taskId, newTask);
    const newResolved = resolveBlocks(ctx, newTask);
    resolvedByTask.set(taskId, newResolved);
    refreshGroups();
    const newSpan = taskSpan(newResolved);

    changes.push({
      taskId,
      blocks: proposed,
      oldStart: oldSpan?.start ?? null,
      newStart: newSpan?.start ?? null,
      oldEnd: oldSpan?.end ?? null,
      newEnd: newSpan?.end ?? null,
      oldBlockCount: resolved.length,
      newBlockCount: newResolved.length,
    });
  }

  if (changes.length === 0) return null;

  const threatenedDeadlines: Proposal['threatenedDeadlines'] = [];
  for (const task of file.tasks) {
    if (!task.deadline) continue;
    const span =
      task.type === 'group'
        ? (groupAggByTask.get(task.id)?.span ?? null)
        : taskSpan(resolvedByTask.get(task.id) ?? []);
    if (span && span.end > task.deadline) {
      threatenedDeadlines.push({ taskId: task.id, deadline: task.deadline, end: span.end });
    }
  }

  return { changes, threatenedDeadlines };
}

/** Remplace la tâche vue par la hiérarchie (Map mutable interne à la proposition). */
function hierarchyPatch(tasksById: ReadonlyMap<string, Task>, id: string, task: Task): void {
  (tasksById as Map<string, Task>).set(id, task);
}

/**
 * Re-blocage d'une tâche : conserve le passé, place le reste à faire au plus
 * tôt autorisé (jamais avant sa position actuelle), découpé autour des jours
 * sans capacité. Retourne null si rien ne change.
 */
function placeTask(
  ctx: CalcContext,
  inputs: LinkInputs,
  task: Task,
  resolved: ResolvedBlock[],
  today: IsoDate,
): Block[] | null {
  const sorted = [...resolved].sort((a, b) => a.from.localeCompare(b.from));
  const lastBlock = sorted[sorted.length - 1]?.block;
  const assignments: Assignment[] = (lastBlock?.assignments ?? []).map((a) => ({ ...a }));
  if (assignments.length === 0) return null; // tâche non affectée : rien à placer

  // 1. blocs passés gardés intacts (part passée d'un bloc à cheval comprise)
  const kept: Block[] = [];
  let firstPlannedFuture: IsoDate | null = null;
  for (const r of sorted) {
    if (r.to < today) {
      kept.push({ ...r.block, to: r.block.to ?? r.to });
    } else if (r.from < today) {
      kept.push({ ...r.block, to: addDays(today, -1) });
      firstPlannedFuture ??= today;
    } else {
      firstPlannedFuture ??= r.from;
    }
  }

  // 2. la proposition ne touche qu'aux tâches qui en ont besoin : lien violé,
  //    jour ouvré sans capacité dans un bloc à venir, ou effort non casé.
  //    (Sinon on écraserait des découpages volontaires parfaitement sains.)
  const earliest = earliestStart(inputs, task).date;
  const future = sorted.filter((r) => r.to >= today);
  const violated = Boolean(earliest && firstPlannedFuture && firstPlannedFuture < earliest);
  let overflow = sorted.some((r) => r.overflow);
  if (!overflow && !sorted.some((r) => r.block.to === null)) {
    let capacity = 0;
    for (const r of sorted) capacity += plannedFutureCapacity(ctx, task, r.block);
    overflow = capacity < task.remaining - EPS;
  }
  let deadDay = false;
  outer: for (const r of future) {
    for (let d = maxIso(r.from, today); d <= r.to; d = addDays(d, 1)) {
      if (!ctx.isGlobalWorkingDay(d)) continue;
      let cap = 0;
      for (const a of r.block.assignments) {
        cap += ctx.assignmentCapacity(a.resourceId, task.projectId, a.units, d);
      }
      if (cap === 0) {
        deadDay = true;
        break outer;
      }
    }
  }
  if (!violated && !overflow && !deadDay) return null;

  let start = maxIso(today, firstPlannedFuture ?? today);
  if (earliest) start = maxIso(start, earliest);

  // 3. placement découpé autour des jours sans capacité
  const runs: { from: IsoDate; to: IsoDate }[] = [];
  let current: { from: IsoDate; to: IsoDate } | null = null;
  let cumulative = 0;
  let day = start;
  for (let i = 0; i < HORIZON_DAYS && cumulative < task.remaining - EPS; i++) {
    let cap = 0;
    for (const a of assignments) {
      cap += ctx.assignmentCapacity(a.resourceId, task.projectId, a.units, day);
    }
    if (cap > 0) {
      if (current) current.to = day;
      else current = { from: day, to: day };
      cumulative += cap;
    } else if (ctx.isGlobalWorkingDay(day) && current) {
      // jour ouvré sans capacité (absence datée…) : on découpe
      runs.push(current);
      current = null;
    }
    day = addDays(day, 1);
  }
  if (cumulative < task.remaining - EPS) return null; // effort toujours non casé : on ne propose rien
  if (current) runs.push(current);
  if (runs.length === 0) return null;

  // 4. comparaison avec l'existant : identique → pas de changement
  const sameShape =
    future.length === runs.length &&
    future.every((r, i) => {
      const visibleFrom = maxIso(r.from, today);
      return visibleFrom === runs[i]!.from && r.to === runs[i]!.to;
    });
  if (sameShape) return null;

  // 5. matérialisation : derniers blocs ; le dernier reste ouvert (fin calculée)
  const blocks: Block[] = [...kept];
  runs.forEach((run, i) => {
    blocks.push({
      id: newId('b'),
      from: run.from,
      to: i === runs.length - 1 ? null : run.to,
      assignments: assignments.map((a) => ({ ...a })),
    });
  });
  return blocks;
}

/** Delta en jours calendaires entre deux dates (signe inclus), pour les impacts. */
export function changeDelta(change: TaskChange): number {
  if (!change.oldEnd || !change.newEnd) return 0;
  return diffDays(change.oldEnd, change.newEnd);
}
