import type { IsoDate, TeamFile } from '../model/types';
import { createCalcContext, type CalcContext } from './context';
import { resolveBlocks, taskSpan, type ResolvedBlock, type TaskSpan } from './blocks';
import { buildHierarchy, type Hierarchy } from './hierarchy';
import { aggregateGroup, type GroupAggregate } from './groups';
import {
  earliestStart,
  topologicalOrder,
  type EarliestResult,
  type LinkInputs,
} from './links';
import { buildLoadIndex, findOverEngagements, type LoadIndex, type OverEngagement } from './workload';

/**
 * Résultat complet d'un recalcul — tout ce que l'UI consomme.
 * Le moteur calcule, vérifie et propose ; il n'applique jamais rien.
 */
export interface Schedule {
  ctx: CalcContext;
  hierarchy: Hierarchy;
  resolvedByTask: Map<string, ResolvedBlock[]>;
  /** Étendue par tâche : tâche = blocs, jalon = date, groupe = union. */
  spanByTask: Map<string, TaskSpan | null>;
  groupAggByTask: Map<string, GroupAggregate>;
  earliestByTask: Map<string, EarliestResult>;
  linkInputs: LinkInputs;
  /** Cycle de liens détecté (ids), null si le graphe est sain. */
  cycle: string[] | null;
  loadIndex: LoadIndex;
  overEngagements: OverEngagement[];
  /** Étendue totale du plan (min/max des blocs résolus). */
  planSpan: TaskSpan | null;
}

export function computeSchedule(file: TeamFile, today: IsoDate): Schedule {
  const ctx = createCalcContext(file, today);
  const hierarchy = buildHierarchy(file.tasks);

  const resolvedByTask = new Map<string, ResolvedBlock[]>();
  for (const task of file.tasks) {
    if (task.type === 'group') continue;
    resolvedByTask.set(task.id, resolveBlocks(ctx, task));
  }

  const groupAggByTask = new Map<string, GroupAggregate>();
  for (const task of file.tasks) {
    if (task.type !== 'group') continue;
    groupAggByTask.set(task.id, aggregateGroup(ctx, hierarchy.descendantsOf(task.id), resolvedByTask));
  }

  const spanByTask = new Map<string, TaskSpan | null>();
  let planStart: IsoDate | null = null;
  let planEnd: IsoDate | null = null;
  for (const task of file.tasks) {
    let span: TaskSpan | null;
    if (task.type === 'group') {
      span = groupAggByTask.get(task.id)?.span ?? null;
    } else if (task.type === 'milestone') {
      span = task.date ? { start: task.date, end: task.date } : null;
    } else {
      span = taskSpan(resolvedByTask.get(task.id) ?? []);
    }
    spanByTask.set(task.id, span);
    if (span) {
      if (planStart === null || span.start < planStart) planStart = span.start;
      if (planEnd === null || span.end > planEnd) planEnd = span.end;
    }
  }

  const linkInputs: LinkInputs = { ctx, hierarchy, resolvedByTask, groupAggByTask };
  const earliestByTask = new Map<string, EarliestResult>();
  for (const task of file.tasks) {
    if (task.links.length > 0) earliestByTask.set(task.id, earliestStart(linkInputs, task));
  }

  const { cycle } = topologicalOrder(file.tasks);

  const loadIndex = buildLoadIndex(ctx, hierarchy, resolvedByTask);
  const overEngagements = findOverEngagements(ctx, loadIndex);

  return {
    ctx,
    hierarchy,
    resolvedByTask,
    spanByTask,
    groupAggByTask,
    earliestByTask,
    linkInputs,
    cycle,
    loadIndex,
    overEngagements,
    planSpan: planStart && planEnd ? { start: planStart, end: planEnd } : null,
  };
}
