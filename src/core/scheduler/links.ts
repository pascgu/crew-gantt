import type { IsoDate, Task, TaskLink } from '../model/types';
import { addDays } from '../calendar/dates';
import type { CalcContext } from './context';
import { blockCapacityOnDay, taskSpan, type ResolvedBlock } from './blocks';
import type { GroupAggregate } from './groups';
import type { Hierarchy } from './hierarchy';

export interface LinkGraphResult {
  /** Ordre topologique (prédécesseurs d'abord), null si cycle. */
  order: string[] | null;
  /** Ids des tâches formant un cycle, dans l'ordre du cycle (null si aucun). */
  cycle: string[] | null;
}

/** Tri topologique du graphe des liens + détection de cycle (DFS trois couleurs). */
export function topologicalOrder(tasks: Task[]): LinkGraphResult {
  const ids = new Set(tasks.map((t) => t.id));
  const successors = new Map<string, string[]>();
  for (const task of tasks) {
    for (const link of task.links) {
      if (!ids.has(link.on)) continue;
      const list = successors.get(link.on);
      if (list) list.push(task.id);
      else successors.set(link.on, [task.id]);
    }
  }

  const state = new Map<string, 'gray' | 'black'>();
  const order: string[] = [];
  const stack: string[] = [];
  let cycle: string[] | null = null;

  const visit = (id: string): boolean => {
    const s = state.get(id);
    if (s === 'black') return true;
    if (s === 'gray') {
      const start = stack.indexOf(id);
      cycle = stack.slice(start);
      return false;
    }
    state.set(id, 'gray');
    stack.push(id);
    for (const next of successors.get(id) ?? []) {
      if (!visit(next)) return false;
    }
    stack.pop();
    state.set(id, 'black');
    order.push(id);
    return true;
  };

  for (const task of tasks) {
    if (!visit(task.id)) return { order: null, cycle };
  }
  return { order: order.reverse(), cycle: null };
}

/** true si ajouter un lien `successorId → dépend de → predecessorId` créerait un cycle. */
export function wouldCreateCycle(
  tasks: Task[],
  successorId: string,
  predecessorId: string,
): boolean {
  if (successorId === predecessorId) return true;
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  // Cycle ssi `successorId` est déjà atteignable depuis `predecessorId` en remontant ses prédécesseurs.
  const seen = new Set<string>();
  const stack = [predecessorId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === successorId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const task = tasksById.get(id);
    for (const link of task?.links ?? []) stack.push(link.on);
  }
  return false;
}

export interface LinkInputs {
  ctx: CalcContext;
  hierarchy: Hierarchy;
  resolvedByTask: ReadonlyMap<string, ResolvedBlock[]>;
  groupAggByTask: ReadonlyMap<string, GroupAggregate>;
}

/** Étendue effective d'un prédécesseur : tâche = ses blocs, jalon = sa date, groupe = son union. */
export function effectiveSpan(
  inputs: LinkInputs,
  taskId: string,
): { start: IsoDate; end: IsoDate } | null {
  const task = inputs.hierarchy.tasksById.get(taskId);
  if (!task) return null;
  if (task.type === 'milestone') {
    return task.date ? { start: task.date, end: task.date } : null;
  }
  if (task.type === 'group') {
    return inputs.groupAggByTask.get(taskId)?.span ?? null;
  }
  return taskSpan(inputs.resolvedByTask.get(taskId) ?? []);
}

/**
 * Jour où une tâche atteint `n` jours travaillés cumulés (capacité sommée jour
 * par jour sur ses blocs ; bloc sans affectation : 1 j par jour ouvré global).
 * L'ancre « après N jours de travail » reste juste même si la source est
 * découpée ou déplacée. null si jamais atteint dans les blocs.
 */
export function workedDaysReachedOn(inputs: LinkInputs, taskId: string, n: number): IsoDate | null {
  const task = inputs.hierarchy.tasksById.get(taskId);
  if (!task) return null;
  if (task.type === 'milestone') return task.date;

  const sources: { task: Task; resolved: ResolvedBlock[] }[] = [];
  if (task.type === 'group') {
    for (const d of inputs.hierarchy.descendantsOf(taskId)) {
      if (d.type === 'task') sources.push({ task: d, resolved: inputs.resolvedByTask.get(d.id) ?? [] });
    }
  } else {
    sources.push({ task, resolved: inputs.resolvedByTask.get(taskId) ?? [] });
  }

  const intervals = sources
    .flatMap(({ task: t, resolved }) => resolved.map((r) => ({ t, r })))
    .sort((a, b) => a.r.from.localeCompare(b.r.from));
  if (intervals.length === 0) return null;

  const first = intervals[0]!.r.from;
  let last = intervals[0]!.r.to;
  for (const { r } of intervals) if (r.to > last) last = r.to;

  let cumulative = 0;
  for (let day = first; day <= last; day = addDays(day, 1)) {
    for (const { t, r } of intervals) {
      if (day < r.from || day > r.to) continue;
      if (r.block.assignments.length > 0) {
        cumulative += blockCapacityOnDay(inputs.ctx, t, r.block, day);
      } else if (inputs.ctx.isGlobalWorkingDay(day)) {
        cumulative += 1;
      }
    }
    if (cumulative >= n - 1e-9) return day;
  }
  return null;
}

export interface EarliestResult {
  /** Date de début au plus tôt dérivée des liens (null : aucune contrainte). */
  date: IsoDate | null;
  /** Le lien qui détermine cette date. */
  bindingLink: TaskLink | null;
  /** Détail par lien (les liens dont le prédécesseur n'est pas datable sont null). */
  perLink: { link: TaskLink; date: IsoDate | null }[];
}

/** Date de début au plus tôt d'une tâche, dérivée de ses liens (contrainte faible). */
export function earliestStart(inputs: LinkInputs, task: Task): EarliestResult {
  const perLink: { link: TaskLink; date: IsoDate | null }[] = [];
  let best: IsoDate | null = null;
  let binding: TaskLink | null = null;

  for (const link of task.links) {
    const span = effectiveSpan(inputs, link.on);
    let date: IsoDate | null = null;
    if (span) {
      const { ctx } = inputs;
      switch (link.type) {
        case 'after-end':
          date = ctx.addWorkingDays(span.end, 1 + link.lag);
          break;
        case 'with-start':
          date = ctx.addWorkingDays(span.start, link.lag);
          break;
        case 'after-progress': {
          const reached = workedDaysReachedOn(inputs, link.on, link.progressDays ?? 0);
          date = ctx.addWorkingDays(reached ?? span.end, 1 + link.lag);
          break;
        }
      }
    }
    perLink.push({ link, date });
    if (date !== null && (best === null || date > best)) {
      best = date;
      binding = link;
    }
  }
  return { date: best, bindingLink: binding, perLink };
}

export interface ChainStep {
  taskId: string;
  /** Lien (porté par la tâche précédente de la chaîne) qui contraint. */
  viaLink: TaskLink | null;
}

/**
 * Chaîne contraignante d'un jalon : remontée des liens qui déterminent sa date
 * au plus tôt — l'équivalent utile du chemin critique, adapté aux liens faibles.
 * On s'arrête dès qu'une tâche a de la marge libre (placée après son « au plus tôt »).
 */
export function constrainingChain(
  inputs: LinkInputs,
  earliestByTask: ReadonlyMap<string, EarliestResult>,
  milestoneId: string,
): ChainStep[] {
  const chain: ChainStep[] = [{ taskId: milestoneId, viaLink: null }];
  const visited = new Set([milestoneId]);
  let currentId = milestoneId;

  for (;;) {
    const earliest = earliestByTask.get(currentId);
    const binding = earliest?.bindingLink ?? null;
    if (!binding || visited.has(binding.on)) break;

    chain.push({ taskId: binding.on, viaLink: binding });
    visited.add(binding.on);
    currentId = binding.on;

    // La remontée continue seulement si ce prédécesseur est lui-même collé à sa contrainte.
    const predSpan = effectiveSpan(inputs, currentId);
    const predEarliest = earliestByTask.get(currentId);
    if (!predSpan || !predEarliest?.date || predSpan.start > predEarliest.date) break;
  }
  return chain;
}
