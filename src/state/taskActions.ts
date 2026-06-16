import { createBlock, createTask, newId } from '@/core/model/factory';
import { wouldCreateCycle } from '@/core/scheduler/links';
import { createCalcContext } from '@/core/scheduler/context';
import { realizedBeforeReview } from '@/core/scheduler/blocks';
import { addDays, todayIso } from '@/core/calendar/dates';
import { t } from '@/i18n/fr';
import type { Assignment, IsoDate, Task, TaskLink, TaskType, TeamFile } from '@/core/model/types';
import { useAppStore } from './store';

const mutate = (fn: (file: TeamFile) => void) => useAppStore.getState().mutate(fn);

function taskById(file: TeamFile, id: string): Task | undefined {
  return file.tasks.find((t) => t.id === id);
}

/**
 * Recale le reste sur le réalisé géométrique (passé figé) en gardant l'effort comme ancre :
 * `remaining = max(0, effort − réaliséGéo)`. À appeler depuis un `mutate` après un geste qui change
 * le passé (déplacement, bord gauche). Sans effet sur les tâches fixed.
 */
function resyncRemainingDraft(file: TeamFile, task: Task): void {
  if (task.scheduling !== 'effort') return;
  const reviewDate = useAppStore.getState().reviewDate ?? todayIso();
  const ctx = createCalcContext(file, reviewDate);
  const realized = realizedBeforeReview(ctx, task);
  task.remaining = Math.max(0, task.effort - realized);
}

/** Resync explicite (changement du trait de revue, réaffectation). */
export function resyncRemaining(id: string): void {
  mutate((file) => {
    const task = taskById(file, id);
    if (task) resyncRemainingDraft(file, task);
  });
}

/**
 * Recale le reste de toutes les tâches effort sur le trait de revue courant (un seul contexte de
 * calcul). Appelé quand la date de réunion change : le réalisé monte, le reste diminue, l'effort
 * reste stable.
 */
export function resyncAllRemaining(): void {
  const reviewDate = useAppStore.getState().reviewDate ?? todayIso();
  mutate((file) => {
    const ctx = createCalcContext(file, reviewDate);
    for (const task of file.tasks) {
      if (task.type === 'task' && task.scheduling === 'effort') {
        task.remaining = Math.max(0, task.effort - realizedBeforeReview(ctx, task));
      }
    }
  });
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
    if (!task) return;
    const wasFixed = task.scheduling === 'fixed';
    Object.assign(task, patch);
    // Passer de fixed → effort : ouvrir tous les blocs fermés pour que resolveBlocks les pilote
    if (wasFixed && task.scheduling === 'effort') {
      for (const block of task.blocks) block.to = null;
    }
  });
}

/**
 * Effort = réalisé + reste. Le réalisé (= effort − reste) est le pivot : on le préserve en
 * reportant la variation d'effort sur le reste. Tâche fixed : champ seul (le reste ne pilote rien).
 */
export function setTaskEffort(id: string, effort: number): void {
  mutate((file) => {
    const task = taskById(file, id);
    if (!task) return;
    const next = Math.max(0, effort);
    if (task.scheduling === 'effort') {
      task.remaining = Math.max(0, task.remaining + (next - task.effort));
    }
    task.effort = next;
  });
}

/**
 * Reste à faire = futur, pilote la barre et la date de fin. Préserve le réalisé en reportant la
 * variation sur l'effort (effort = réalisé + reste). Tâche fixed : champ seul.
 */
export function setTaskRemaining(id: string, remaining: number): void {
  mutate((file) => {
    const task = taskById(file, id);
    if (!task) return;
    const next = Math.max(0, remaining);
    if (task.scheduling === 'effort') {
      task.effort = Math.max(0, task.effort + (next - task.remaining));
    }
    task.remaining = next;
  });
}

/** Avancement (0..1) = % de travail accompli, saisi à la main, indépendant du réalisé/reste. */
export function setTaskProgress(id: string, progress: number): void {
  mutate((file) => {
    const task = taskById(file, id);
    if (!task) return;
    task.progress = Math.max(0, Math.min(1, progress));
  });
}

export function setTaskScheduling(id: string, mode: import('@/core/model/types').SchedulingMode): void {
  mutate((file) => {
    const task = taskById(file, id);
    if (task) task.scheduling = mode;
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
      task.progress = 1; // terminé = 100 % d'avancement
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
    const project = file.projects.find((p) => p.id === projectId);
    const task = createTask({
      name: t('tasks.newName'),
      projectId,
      parentId,
      type: options.type ?? 'task',
      scheduling: project?.defaultScheduling ?? 'fixed',
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

function sortedSiblings(file: TeamFile, parentId: string | null): Task[] {
  return file.tasks
    .filter((t) => t.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** ALT+↑ : échanger avec le sibling précédent. */
export function moveTaskUp(id: string): boolean {
  const file = useAppStore.getState().file;
  const task = taskById(file, id);
  if (!task) return false;
  const siblings = sortedSiblings(file, task.parentId);
  const i = siblings.findIndex((s) => s.id === id);
  if (i <= 0) return false;
  return moveTask(id, siblings[i - 1]!.id, 'before');
}

/** ALT+↓ : échanger avec le sibling suivant. */
export function moveTaskDown(id: string): boolean {
  const file = useAppStore.getState().file;
  const task = taskById(file, id);
  if (!task) return false;
  const siblings = sortedSiblings(file, task.parentId);
  const i = siblings.findIndex((s) => s.id === id);
  if (i < 0 || i >= siblings.length - 1) return false;
  return moveTask(id, siblings[i + 1]!.id, 'after');
}

/** ALT+→ : devenir enfant du sibling précédent. */
export function indentTask(id: string): boolean {
  const file = useAppStore.getState().file;
  const task = taskById(file, id);
  if (!task) return false;
  const siblings = sortedSiblings(file, task.parentId);
  const i = siblings.findIndex((s) => s.id === id);
  const prev = i > 0 ? siblings[i - 1]! : undefined;
  if (!prev || prev.type === 'milestone') return false;
  return moveTask(id, prev.id, 'child');
}

/** ALT+← : remonter d'un niveau (sibling après son parent). */
export function outdentTask(id: string): boolean {
  const file = useAppStore.getState().file;
  const task = taskById(file, id);
  if (!task?.parentId) return false;
  return moveTask(id, task.parentId, 'after');
}

/**
 * Convertir tâche ↔ groupe ↔ jalon. Non destructif autant que possible :
 * - vers jalon : refusé s'il y a des enfants ; la date reprend le début du 1er bloc ;
 * - vers jalon ou groupe : les blocs propres sont abandonnés (le groupe agrège ses enfants) ;
 * - vers tâche : la date de jalon est effacée, les blocs repartent à vide.
 */
export function convertTaskType(id: string, type: TaskType): boolean {
  let ok = false;
  mutate((file) => {
    const task = taskById(file, id);
    if (!task || task.type === type) return;
    const hasChildren = file.tasks.some((t) => t.parentId === id);
    if (type === 'milestone' && hasChildren) return;
    if (type === 'milestone') {
      task.date = task.date ?? task.blocks[0]?.from ?? todayIso();
      task.blocks = [];
    } else if (type === 'group') {
      task.blocks = [];
      task.date = null;
    } else {
      task.date = null;
    }
    task.type = type;
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
    // Tâche effort encore vide (0 j-h) : un bloc sans affectation donne une barre nulle.
    // Poser 1 j-h d'effort/reste par défaut pour qu'elle soit visible et ajustable.
    if (task.scheduling === 'effort' && task.effort <= 0) {
      task.effort = 1;
      task.remaining = 1;
    }
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
    const task = taskById(file, taskId);
    const block = task?.blocks.find((b) => b.id === blockId);
    if (!task || !block) return;
    block.from = addDays(block.from, deltaDays);
    if (block.to !== null) block.to = addDays(block.to, deltaDays);
    // Le passé a bougé → réalisé recalculé, effort conservé.
    resyncRemainingDraft(file, task);
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

/** Fusionne les blocs qui se chevauchent ou se touchent après un déplacement. */
export function mergeOverlappingBlocks(taskId: string): void {
  mutate((file) => {
    const task = taskById(file, taskId);
    if (!task || task.blocks.length < 2) return;
    const sorted = [...task.blocks].sort((a, b) => a.from.localeCompare(b.from));
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < sorted.length - 1; i++) {
        const cur = sorted[i]!;
        const next = sorted[i + 1]!;
        const curToCompare = cur.to ?? '9999-99-99';
        if (curToCompare >= next.from) {
          const mergedTo = cur.to === null || next.to === null ? null :
            cur.to >= next.to ? cur.to : next.to;
          cur.to = mergedTo;
          if (cur.assignments.length === 0 && next.assignments.length > 0) {
            cur.assignments = next.assignments.map((a) => ({ ...a }));
          }
          sorted.splice(i + 1, 1);
          changed = true;
          break;
        }
      }
    }
    task.blocks = sorted;
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

export function collapseAll(): void {
  mutate((file) => {
    const parents = new Set<string>();
    for (const task of file.tasks) {
      if (task.parentId !== null) parents.add(task.parentId);
    }
    file.ui.collapsed = [...parents];
  });
}

export function expandAll(): void {
  mutate((file) => {
    file.ui.collapsed = [];
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
