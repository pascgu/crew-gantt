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
import {
  earliestStart,
  topologicalOrder,
  workedDaysReachedOn,
  type LinkInputs,
} from '../scheduler/links';

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
 * - les tâches terminées ne bougent pas ; les tâches fixed ne bougent que pour
 *   respecter un lien violé (translation, ou découpage à l'ancre targetDays),
 *   jamais pour la capacité ;
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

  // Enregistre un re-blocage : reflète les nouveaux blocs (cascade), recalcule les
  // groupes, et empile le TaskChange (vues span/compteurs pour le panneau Impacts).
  const pushReblock = (taskId: string, resolved: ResolvedBlock[], newBlocks: Block[]): void => {
    const oldSpan = taskSpan(resolved);
    const newTask = { ...taskFor(taskId), blocks: newBlocks };
    reblocked.set(taskId, newTask);
    hierarchyPatch(tasksById, taskId, newTask);
    const newResolved = resolveBlocks(ctx, newTask);
    resolvedByTask.set(taskId, newResolved);
    refreshGroups();
    const newSpan = taskSpan(newResolved);
    changes.push({
      taskId,
      blocks: newBlocks,
      oldStart: oldSpan?.start ?? null,
      newStart: newSpan?.start ?? null,
      oldEnd: oldSpan?.end ?? null,
      newEnd: newSpan?.end ?? null,
      oldBlockCount: resolved.length,
      newBlockCount: newResolved.length,
    });
  };

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

    if (task.type !== 'task' || task.status === 'done' || task.status === 'cancelled') continue;
    if (task.blocks.length === 0) continue;

    const resolved = resolvedByTask.get(taskId) ?? [];

    // Tâche « 0 jour » (note/micro-rappel) : un point, jamais étiré — quel que soit
    // le mode. On la translate seulement pour respecter un lien violé, en conservant
    // son caractère 0 j (le passage par placeTask la transformerait en bloc réel).
    if (task.blocks.every((b) => b.zero)) {
      const shifted = shiftZeroMarker(inputs, task, resolved, today);
      if (shifted) pushReblock(taskId, resolved, shifted);
      continue;
    }

    // Tâches fixed : on ne les re-bloque jamais pour la capacité, mais on propose
    // de glisser/découper celles qui violent un lien (translation, ou découpage à
    // l'ancre targetDays). Le reste du chemin (placeTask) reste réservé à l'effort.
    if (task.scheduling === 'fixed') {
      const shifted = shiftFixedTask(ctx, inputs, task, resolved, today);
      if (shifted) pushReblock(taskId, resolved, shifted);
      continue;
    }

    if (task.remaining <= EPS) continue;

    const proposed = placeTask(ctx, inputs, task, resolved, today);
    if (!proposed) continue;
    pushReblock(taskId, resolved, proposed);
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
  const earliestResult = earliestStart(inputs, task);
  const earliest = earliestResult.date;
  // Liens ancrés sur un point interne (« N jours travaillés ») : ne contraignent
  // pas le début, mais le jour où la tâche atteint ses N jours doit être ≥ date.
  const anchors: { workedDays: number; date: IsoDate }[] = [];
  for (const p of earliestResult.perLink) {
    if (p.link.targetDays != null && p.date != null) {
      anchors.push({ workedDays: p.link.targetDays, date: p.date });
    }
  }
  const future = sorted.filter((r) => r.to >= today);
  const violated = Boolean(earliest && firstPlannedFuture && firstPlannedFuture < earliest);
  let anchorViolated = false;
  for (const c of anchors) {
    const reached = workedDaysReachedOn(inputs, task.id, c.workedDays);
    if (reached && reached < c.date) {
      anchorViolated = true;
      break;
    }
  }
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
  if (!violated && !overflow && !deadDay && !anchorViolated) return null;

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
      // Pause si ce jour franchirait une ancre « N jours » avant sa date requise :
      // la tâche a le droit de faire ses N premiers jours en parallèle, pas au-delà.
      let pauseUntil: IsoDate | null = null;
      for (const c of anchors) {
        if (cumulative < c.workedDays - EPS && cumulative + cap >= c.workedDays - EPS && day < c.date) {
          if (!pauseUntil || c.date > pauseUntil) pauseUntil = c.date;
        }
      }
      if (pauseUntil) {
        if (current) {
          runs.push(current);
          current = null;
        }
        day = pauseUntil; // saute à la date requise ; la reprise est gérée à l'itération suivante
        continue;
      }
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

/**
 * Premier jour ≥ `from` où le travail est réellement possible : un bloc affecté
 * démarre dès qu'≥1 affecté a de la capacité (gère les congés individuels) ; un
 * bloc non affecté démarre au premier jour ouvré global. null si rien dans l'horizon.
 */
function firstWorkableDay(
  ctx: CalcContext,
  assignments: Assignment[],
  projectId: string,
  from: IsoDate,
): IsoDate | null {
  let day = from;
  for (let i = 0; i < HORIZON_DAYS; i++) {
    if (assignments.length > 0) {
      let cap = 0;
      for (const a of assignments) cap += ctx.assignmentCapacity(a.resourceId, projectId, a.units, day);
      if (cap > 0) return day;
    } else if (ctx.isGlobalWorkingDay(day)) {
      return day;
    }
    day = addDays(day, 1);
  }
  return null;
}

/**
 * Proposition pour une tâche entièrement « 0 jour » (note/micro-rappel) : c'est un
 * point, jamais étiré. On translate ses blocs (en conservant `zero`) vers le plus
 * tôt autorisé si un lien est violé. null si rien à proposer.
 */
function shiftZeroMarker(
  inputs: LinkInputs,
  task: Task,
  resolved: ResolvedBlock[],
  today: IsoDate,
): Block[] | null {
  const sorted = [...resolved].sort((a, b) => a.from.localeCompare(b.from));
  const kept: Block[] = [];
  const future: ResolvedBlock[] = [];
  for (const r of sorted) {
    if (r.from >= today) future.push(r);
    else kept.push(r.block);
  }
  if (future.length === 0) return null;

  const earliest = earliestStart(inputs, task).date;
  if (!earliest || future[0]!.from >= earliest) return null;
  const delta = diffDays(future[0]!.from, earliest);
  if (delta <= 0) return null;

  return [
    ...kept,
    ...future.map((r) => ({
      ...r.block,
      from: addDays(r.block.from, delta),
      to: r.block.to === null ? null : addDays(r.block.to, delta),
      assignments: r.block.assignments.map((a) => ({ ...a })),
    })),
  ];
}

/**
 * Proposition pour une tâche fixed en conflit de lien — forme dessinée préservée :
 * - lien simple (sur le début) : translate tous les blocs futurs vers le premier
 *   jour travaillable ≥ au plus tôt ;
 * - lien ancré (targetDays) : découpe à l'ancre (les N premiers jours restent),
 *   insère l'attente, pousse la queue vers le premier jour travaillable ≥ date requise.
 * Les blocs passés (et un bloc à cheval) restent intacts. null si rien à proposer.
 */
function shiftFixedTask(
  ctx: CalcContext,
  inputs: LinkInputs,
  task: Task,
  resolved: ResolvedBlock[],
  today: IsoDate,
): Block[] | null {
  const sorted = [...resolved].sort((a, b) => a.from.localeCompare(b.from));
  const kept: Block[] = [];
  const future: ResolvedBlock[] = [];
  for (const r of sorted) {
    if (r.from >= today) future.push(r);
    else kept.push(r.block); // passé ou à cheval sur today : laissé tel quel (dates manuelles)
  }
  if (future.length === 0) return null;

  const earliestResult = earliestStart(inputs, task);

  // Cas 1 — lien simple (contrainte sur le début) : prioritaire, translate tout.
  const earliest = earliestResult.date;
  if (earliest && future[0]!.from < earliest) {
    const start = firstWorkableDay(
      ctx,
      future[0]!.block.assignments,
      task.projectId,
      maxIso(today, earliest),
    );
    if (start) {
      const delta = diffDays(future[0]!.from, start);
      if (delta > 0) {
        return [
          ...kept,
          ...future.map((r) => ({
            ...r.block,
            from: addDays(r.block.from, delta),
            to: r.block.to === null ? null : addDays(r.block.to, delta),
            assignments: r.block.assignments.map((a) => ({ ...a })),
          })),
        ];
      }
    }
  }

  // Cas 2 — lien ancré (targetDays) : découpe au N-ième jour travaillé, pousse la queue.
  let bestAnchor: { date: IsoDate; anchorDay: IsoDate } | null = null;
  for (const { link, date } of earliestResult.perLink) {
    if (link.targetDays == null || date == null) continue;
    const anchorDay = workedDaysReachedOn(inputs, task.id, link.targetDays);
    if (anchorDay && anchorDay < date && (!bestAnchor || date > bestAnchor.date)) {
      bestAnchor = { date, anchorDay };
    }
  }
  if (bestAnchor) {
    const { date, anchorDay } = bestAnchor;
    const head: Block[] = [];
    const tailRaw: Block[] = [];
    // L'ancre est le jour où la tâche atteint ses N jours travaillés : ce jour doit
    // partir ≥ date, donc il ouvre la queue (la tête garde les jours strictement avant).
    for (const r of future) {
      const b = r.block;
      const bTo = b.to ?? b.from; // bloc fixed ouvert : réduit à sa date de début
      const clone = (extra: Partial<Block> = {}): Block => ({
        ...b,
        assignments: b.assignments.map((a) => ({ ...a })),
        ...extra,
      });
      if (bTo < anchorDay) {
        head.push(clone());
      } else if (b.from >= anchorDay) {
        tailRaw.push(clone());
      } else {
        // bloc à cheval sur l'ancre : tête jusqu'à la veille, queue à partir de l'ancre
        head.push(clone({ to: addDays(anchorDay, -1) }));
        tailRaw.push(clone({ id: newId('b'), from: anchorDay }));
      }
    }
    if (tailRaw.length === 0) return null;
    const tailStart = firstWorkableDay(
      ctx,
      tailRaw[0]!.assignments,
      task.projectId,
      maxIso(today, date),
    );
    if (!tailStart) return null;
    const tdelta = diffDays(tailRaw[0]!.from, tailStart);
    if (tdelta <= 0) return null;
    const tail = tailRaw.map((b) => ({
      ...b,
      from: addDays(b.from, tdelta),
      to: b.to === null ? null : addDays(b.to, tdelta),
    }));
    return [...kept, ...head, ...tail];
  }

  return null;
}

/** Delta en jours calendaires entre deux dates (signe inclus), pour les impacts. */
export function changeDelta(change: TaskChange): number {
  if (!change.oldEnd || !change.newEnd) return 0;
  return diffDays(change.oldEnd, change.newEnd);
}
