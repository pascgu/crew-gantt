import { createBlock, createTask, newId } from '@/core/model/factory';
import { wouldCreateCycle } from '@/core/scheduler/links';
import { addDays } from '@/core/calendar/dates';
import { t } from '@/i18n/fr';
import type { Assignment, IsoDate, Task, TaskLink, TaskType, TeamFile } from '@/core/model/types';
import { useAppStore } from './store';

const mutate = (fn: (file: TeamFile) => void) => useAppStore.getState().mutate(fn);

function taskById(file: TeamFile, id: string): Task | undefined {
  return file.tasks.find((t) => t.id === id);
}

/** Réécrit les `order` d'une fratrie pour qu'ils suivent l'ordre du tableau donné. */
function renumberSiblings(file: TeamFile, parentId: string | null): void {
  const siblings = file.tasks
    .filter((t) => t.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  siblings.forEach((t, i) => {
    t.order = i;
  });
}

function descendantIds(file: TeamFile, rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const task of file.tasks) {
      if (task.parentId !== null && ids.has(task.parentId) && !ids.has(task.id)) {
        ids.add(task.id);
        grew = true;
      }
    }
  }
  return ids;
}

// ——— CRUD tâches ———

export function updateTask(id: string, patch: Partial<Task>): void {
  mutate((file) => {
    const task = taskById(file, id);
    if (task) Object.assign(task, patch);
  });
}

/** Modifier l'effort conserve le réalisé : reste = max(0, effort − réalisé). */
export function setTaskEffort(id: string, effort: number): void {
  mutate((file) => {
    const task = taskById(file, id);
    if (!task) return;
    const realized = Math.max(0, task.effort - task.remaining);
    task.effort = Math.max(0, effort);
    task.remaining = Math.max(0, task.effort - realized);
  });
}

export function setTaskRemaining(id: string, remaining: number): void {
  mutate((file) => {
    const task = taskById(file, id);
    if (!task) return;
    task.remaining = Math.max(0, remaining);
    if (task.remaining > task.effort) task.effort = task.remaining;
  });
}

/** Saisie bidirectionnelle : poser un % d'avancement recalcule le reste. */
export function setTaskProgress(id: string, percent: number): void {
  mutate((file) => {
    const task = taskById(file, id);
    if (!task) return;
    const p = Math.max(0, Math.min(100, percent));
    task.remaining = Math.round(task.effort * (1 - p / 100) * 100) / 100;
  });
}

export function initEffortFromEstimate(id: string): void {
  mutate((file) => {
    const task = taskById(file, id);
    if (!task || task.estimate === null) return;
    task.effort = task.estimate;
    task.remaining = task.estimate;
  });
}

export function setTaskStatus(id: string, status: Task['status']): void {
  mutate((file) => {
    const task = taskById(file, id);
    if (!task) return;
    task.status = status;
    if (status === 'done') {
      task.remaining = 0;
      // Clore le bloc ouvert : le travail s'arrête là.
      const open = task.blocks.find((b) => b.to === null);
      if (open) open.to = open.from;
    }
    if (status === 'in_progress' && task.effort > 0 && task.remaining === task.effort) {
      // démarrée : rien à faire de plus, le reste pilote
    }
  });
}

export interface AddTaskOptions {
  /** Insérer après cette tâche (même parent). Sans référence : en fin de racines. */
  afterId?: string;
  /** Devenir enfant de cette tâche. */
  parentId?: string | null;
  type?: TaskType;
  projectId?: string;
}

export function addTask(options: AddTaskOptions = {}): string {
  const id = newId(options.type === 'milestone' ? 'm' : options.type === 'group' ? 'g' : 't');
  mutate((file) => {
    const after = options.afterId ? taskById(file, options.afterId) : undefined;
    const parentId = options.parentId !== undefined ? options.parentId : (after?.parentId ?? null);
    const parent = parentId ? taskById(file, parentId) : undefined;
    const projectId =
      options.projectId ??
      after?.projectId ??
      parent?.projectId ??
      file.projects.find((p) => !p.archived)?.id ??
      file.projects[0]?.id ??
      '';
    const task = createTask({
      name: t('tasks.newName'),
      projectId,
      parentId,
      type: options.type ?? 'task',
    });
    task.id = id;
    task.order = after ? after.order + 0.5 : Number.MAX_SAFE_INTEGER;
    file.tasks.push(task);
    renumberSiblings(file, parentId);
  });
  return id;
}

export function deleteTask(id: string): void {
  mutate((file) => {
    const task = taskById(file, id);
    if (!task) return;
    const removed = descendantIds(file, id);
    const parentId = task.parentId;
    file.tasks = file.tasks.filter((t) => !removed.has(t.id));
    for (const t of file.tasks) {
      t.links = t.links.filter((l) => !removed.has(l.on));
    }
    file.ui.collapsed = file.ui.collapsed.filter((c) => !removed.has(c));
    renumberSiblings(file, parentId);
  });
}

export type MovePosition = 'before' | 'after' | 'child';

/** Réordonner / ré-indenter par glisser-déposer. Refuse de se déplacer dans sa descendance. */
export function moveTask(id: string, targetId: string, position: MovePosition): boolean {
  let ok = false;
  mutate((file) => {
    const task = taskById(file, id);
    const target = taskById(file, targetId);
    if (!task || !target || id === targetId) return;
    if (descendantIds(file, id).has(targetId)) return;
    const oldParent = task.parentId;
    if (position === 'child') {
      task.parentId = target.id;
      task.order = Number.MAX_SAFE_INTEGER;
    } else {
      task.parentId = target.parentId;
      task.order = position === 'before' ? target.order - 0.5 : target.order + 0.5;
    }
    // Une tâche racine porte son projet ; un enfant hérite du projet de son parent.
    const newParent = task.parentId ? taskById(file, task.parentId) : undefined;
    if (newParent) {
      const inherited = newParent.projectId;
      for (const tid of descendantIds(file, id)) {
        const sub = taskById(file, tid);
        if (sub) sub.projectId = inherited;
      }
    }
    renumberSiblings(file, task.parentId);
    if (oldParent !== task.parentId) renumberSiblings(file, oldParent);
    ok = true;
  });
  return ok;
}

/** Changer le projet d'une tâche racine : toute sa descendance suit. */
export function setTaskProject(id: string, projectId: string): void {
  mutate((file) => {
    for (const tid of descendantIds(file, id)) {
      const task = taskById(file, tid);
      if (task) task.projectId = projectId;
    }
  });
}

// ——— Blocs ———

export function addBlockToTask(taskId: string, from: IsoDate): void {
  mutate((file) => {
    const task = taskById(file, taskId);
    if (!task) return;
    // S'il existe déjà un bloc ouvert, le nouveau bloc devient le bloc ouvert.
    const open = task.blocks.find((b) => b.to === null);
    if (open && task.scheduling === 'effort') {
      open.to = open.from; // sera réajusté à la main si besoin
    }
    const block = createBlock({ from });
    if (open) block.assignments = open.assignments.map((a) => ({ ...a }));
    task.blocks.push(block);
    task.blocks.sort((a, b) => a.from.localeCompare(b.from));
  });
}

export function deleteBlock(taskId: string, blockId: string): void {
  mutate((file) => {
    const task = taskById(file, taskId);
    if (!task) return;
    task.blocks = task.blocks.filter((b) => b.id !== blockId);
  });
}

export function moveBlock(taskId: string, blockId: string, deltaDays: number): void {
  if (deltaDays === 0) return;
  mutate((file) => {
    const block = taskById(file, taskId)?.blocks.find((b) => b.id === blockId);
    if (!block) return;
    block.from = addDays(block.from, deltaDays);
    if (block.to !== null) block.to = addDays(block.to, deltaDays);
  });
}

export function setBlockDates(
  taskId: string,
  blockId: string,
  from: IsoDate,
  to: IsoDate | null,
): void {
  mutate((file) => {
    const block = taskById(file, taskId)?.blocks.find((b) => b.id === blockId);
    if (!block) return;
    block.from = from;
    block.to = to !== null && to < from ? from : to;
  });
}

/**
 * Couper un bloc au jour `cutDay` : [from, cutDay−1] + [cutDay, to d'origine].
 * Pour un bloc ouvert, la première moitié devient un découpage volontaire fermé.
 */
export function splitBlock(
  taskId: string,
  blockId: string,
  cutDay: IsoDate,
  resolvedTo: IsoDate,
): void {
  mutate((file) => {
    const task = taskById(file, taskId);
    const block = task?.blocks.find((b) => b.id === blockId);
    if (!task || !block) return;
    if (cutDay <= block.from || cutDay > (block.to ?? resolvedTo)) return;
    const second = createBlock({
      from: cutDay,
      to: block.to,
      assignments: block.assignments.map((a) => ({ ...a })),
    });
    block.to = addDays(cutDay, -1);
    task.blocks.push(second);
    task.blocks.sort((a, b) => a.from.localeCompare(b.from));
  });
}

/** Fusionner un bloc avec le suivant : [from du premier, to du second]. */
export function mergeWithNextBlock(taskId: string, blockId: string): void {
  mutate((file) => {
    const task = taskById(file, taskId);
    if (!task) return;
    const sorted = [...task.blocks].sort((a, b) => a.from.localeCompare(b.from));
    const index = sorted.findIndex((b) => b.id === blockId);
    const block = sorted[index];
    const next = sorted[index + 1];
    if (!block || !next) return;
    block.to = next.to;
    if (next.assignments.length > 0) {
      block.assignments = next.assignments.map((a) => ({ ...a }));
    }
    task.blocks = task.blocks.filter((b) => b.id !== next.id);
  });
}

export function setBlockAssignments(
  taskId: string,
  blockId: string,
  assignments: Assignment[],
): void {
  mutate((file) => {
    const block = taskById(file, taskId)?.blocks.find((b) => b.id === blockId);
    if (block) block.assignments = assignments;
  });
}

// ——— Liens ———

/** Ajoute un lien ; retourne un message d'erreur si un cycle serait créé. */
export function addLink(taskId: string, link: TaskLink): string | null {
  const { file } = useAppStore.getState();
  if (wouldCreateCycle(file.tasks, taskId, link.on)) {
    return t('links.cycleRefused');
  }
  mutate((f) => {
    const task = taskById(f, taskId);
    if (!task) return;
    if (task.links.some((l) => l.on === link.on && l.type === link.type)) return;
    task.links.push(link);
  });
  return null;
}

export function updateLink(taskId: string, index: number, patch: Partial<TaskLink>): void {
  mutate((file) => {
    const link = taskById(file, taskId)?.links[index];
    if (link) Object.assign(link, patch);
  });
}

export function removeLink(taskId: string, index: number): void {
  mutate((file) => {
    const task = taskById(file, taskId);
    if (task) task.links.splice(index, 1);
  });
}

// ——— UI persistée ———

export function toggleCollapsed(taskId: string): void {
  mutate((file) => {
    const i = file.ui.collapsed.indexOf(taskId);
    if (i >= 0) file.ui.collapsed.splice(i, 1);
    else file.ui.collapsed.push(taskId);
  });
}

export function setProjectFilter(filter: string[] | null): void {
  mutate((file) => {
    file.ui.projectFilter = filter;
  });
}

export function setZoom(zoom: TeamFile['ui']['zoom']): void {
  mutate((file) => {
    file.ui.zoom = zoom;
  });
}

export function toggleIgnoredConflict(conflictId: string): void {
  mutate((file) => {
    const i = file.ui.ignoredConflicts.indexOf(conflictId);
    if (i >= 0) file.ui.ignoredConflicts.splice(i, 1);
    else file.ui.ignoredConflicts.push(conflictId);
  });
}
