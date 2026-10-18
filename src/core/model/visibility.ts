import { TASK_PRIORITIES, type Task, type TaskPriority, type TeamFile } from './types';

/**
 * Deux façons de retirer une tâche, à ne pas confondre :
 * - **hors calculs** : statut Annulé, ou projet archivé (un projet archivé est clos) — la tâche ne
 *   charge plus personne, ne lève plus de conflit, ne contraint plus ses successeurs ;
 * - **hors vue** : priorité « masquée » — la tâche disparaît de la liste, du Gantt et de la Réunion,
 *   mais compte toujours dans la charge et l'ordonnancement (sinon le plan ment).
 * « Annulé = hors calculs ; Masquée = hors vue. »
 */

export function archivedProjectIds(file: Pick<TeamFile, 'projects'>): Set<string> {
  return new Set(file.projects.filter((p) => p.archived).map((p) => p.id));
}

/** La tâche compte-t-elle dans le plan ? Non si annulée ou si son projet est archivé. */
export function isCountedTask(
  task: Pick<Task, 'status' | 'projectId'>,
  archivedProjects: ReadonlySet<string>,
): boolean {
  return task.status !== 'cancelled' && !archivedProjects.has(task.projectId);
}

/** Rang de priorité (0 = masquée … 4 = urgente). */
export function priorityRank(priority: TaskPriority): number {
  return TASK_PRIORITIES.indexOf(priority);
}

/** Masquée par sa propre priorité ou par celle d'un groupe ancêtre (masquer un groupe masque ses descendants). */
export function isMaskedTask(task: Task, tasksById: ReadonlyMap<string, Task>): boolean {
  let current: Task | undefined = task;
  let guard = 0;
  while (current) {
    if (current.priority === 'hidden') return true;
    current = current.parentId !== null ? tasksById.get(current.parentId) : undefined;
    if (++guard > 1000) break;
  }
  return false;
}

/** Ids de toutes les tâches masquées (directement ou via un ancêtre). */
export function maskedTaskIds(tasks: readonly Task[]): Set<string> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const out = new Set<string>();
  for (const task of tasks) if (isMaskedTask(task, byId)) out.add(task.id);
  return out;
}
