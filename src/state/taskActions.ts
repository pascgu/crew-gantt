import { createBlock, createTask, newId } from '@/core/model/factory';
import { topologicalOrder, wouldCreateCycle } from '@/core/scheduler/links';
import { createCalcContext } from '@/core/scheduler/context';
import {
  effortCapacityOnDay,
  realizedBeforeReview,
  resolveBlocks,
  taskSpan,
} from '@/core/scheduler/blocks';
import { addDays, diffDays, todayIso } from '@/core/calendar/dates';
import { t } from '@/i18n/fr';
import type { Assignment, Block, IsoDate, Task, TaskLink, TaskType, TeamFile } from '@/core/model/types';
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
  deleteTasks([id]);
}

/** Suppression groupée : un seul `mutate`. Gère parent+enfant tous deux sélectionnés. */
export function deleteTasks(ids: string[]): void {
  if (ids.length === 0) return;
  mutate((file) => {
    const removed = new Set<string>();
    const parents = new Set<string | null>();
    for (const id of ids) {
      const task = taskById(file, id);
      if (!task) continue;
      parents.add(task.parentId);
      for (const tid of descendantIds(file, id)) removed.add(tid);
    }
    if (removed.size === 0) return;
    file.tasks = file.tasks.filter((t) => !removed.has(t.id));
    for (const t of file.tasks) {
      t.links = t.links.filter((l) => !removed.has(l.on));
    }
    file.ui.collapsed = file.ui.collapsed.filter((c) => !removed.has(c));
    for (const parentId of parents) renumberSiblings(file, parentId);
  });
}

export type MovePosition = 'before' | 'after' | 'child';

/** Cœur du déplacement, niveau-draft : réutilisé par `moveTask` et les variantes groupées. */
function moveTaskDraft(file: TeamFile, id: string, targetId: string, position: MovePosition): boolean {
  const task = taskById(file, id);
  const target = taskById(file, targetId);
  if (!task || !target || id === targetId) return false;
  if (descendantIds(file, id).has(targetId)) return false;
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
  return true;
}

/** Réordonner / ré-indenter par glisser-déposer. Refuse de se déplacer dans sa descendance. */
export function moveTask(id: string, targetId: string, position: MovePosition): boolean {
  let ok = false;
  mutate((file) => {
    ok = moveTaskDraft(file, id, targetId, position);
  });
  return ok;
}

/**
 * Glisser-déposer groupé : place toute la sélection à la position visée en conservant son ordre
 * d'affichage relatif. Le premier va à `position` de la cible ; les suivants s'enchaînent juste
 * après. Un seul `mutate` = une seule étape d'undo.
 */
export function moveTasks(ids: string[], targetId: string, position: MovePosition): boolean {
  if (ids.length === 0) return false;
  let ok = false;
  mutate((file) => {
    const ordered = orderByPosition(file, ids).filter((id) => id !== targetId);
    let anchorId = targetId;
    let pos: MovePosition = position;
    for (const id of ordered) {
      if (moveTaskDraft(file, id, anchorId, pos)) {
        ok = true;
        anchorId = id;
        pos = 'after';
      }
    }
  });
  return ok;
}

function sortedSiblings(file: TeamFile, parentId: string | null): Task[] {
  return file.tasks
    .filter((t) => t.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

// ——— Helpers draft (réutilisés par les variantes mono et groupées) ———

function moveUpDraft(file: TeamFile, id: string): boolean {
  const task = taskById(file, id);
  if (!task) return false;
  const siblings = sortedSiblings(file, task.parentId);
  const i = siblings.findIndex((s) => s.id === id);
  if (i <= 0) return false;
  return moveTaskDraft(file, id, siblings[i - 1]!.id, 'before');
}

function moveDownDraft(file: TeamFile, id: string): boolean {
  const task = taskById(file, id);
  if (!task) return false;
  const siblings = sortedSiblings(file, task.parentId);
  const i = siblings.findIndex((s) => s.id === id);
  if (i < 0 || i >= siblings.length - 1) return false;
  return moveTaskDraft(file, id, siblings[i + 1]!.id, 'after');
}

function indentDraft(file: TeamFile, id: string): boolean {
  const task = taskById(file, id);
  if (!task) return false;
  const siblings = sortedSiblings(file, task.parentId);
  const i = siblings.findIndex((s) => s.id === id);
  const prev = i > 0 ? siblings[i - 1]! : undefined;
  if (!prev || prev.type === 'milestone') return false;
  return moveTaskDraft(file, id, prev.id, 'child');
}

function outdentDraft(file: TeamFile, id: string): boolean {
  const task = taskById(file, id);
  if (!task?.parentId) return false;
  return moveTaskDraft(file, id, task.parentId, 'after');
}

/** Ordonne les `ids` selon leur ordre d'affichage (parents puis frères triés). */
function orderByPosition(file: TeamFile, ids: string[]): string[] {
  const wanted = new Set(ids);
  const out: string[] = [];
  const walk = (parentId: string | null): void => {
    for (const sib of sortedSiblings(file, parentId)) {
      if (wanted.has(sib.id)) out.push(sib.id);
      walk(sib.id);
    }
  };
  walk(null);
  return out;
}

/** ALT+↑ : échanger avec le sibling précédent. */
export function moveTaskUp(id: string): boolean {
  let ok = false;
  mutate((file) => {
    ok = moveUpDraft(file, id);
  });
  return ok;
}

/** ALT+↓ : échanger avec le sibling suivant. */
export function moveTaskDown(id: string): boolean {
  let ok = false;
  mutate((file) => {
    ok = moveDownDraft(file, id);
  });
  return ok;
}

/** ALT+→ : devenir enfant du sibling précédent. */
export function indentTask(id: string): boolean {
  let ok = false;
  mutate((file) => {
    ok = indentDraft(file, id);
  });
  return ok;
}

/** ALT+← : remonter d'un niveau (sibling après son parent). */
export function outdentTask(id: string): boolean {
  let ok = false;
  mutate((file) => {
    ok = outdentDraft(file, id);
  });
  return ok;
}

// ——— Variantes groupées (un seul mutate = une seule étape d'undo) ———

/** Indenter toute la sélection (parents différents autorisés). Ordre haut→bas. */
export function indentTasks(ids: string[]): void {
  if (ids.length === 0) return;
  mutate((file) => {
    for (const id of orderByPosition(file, ids)) indentDraft(file, id);
  });
}

/** Désindenter toute la sélection (parents différents autorisés). Ordre bas→haut. */
export function outdentTasks(ids: string[]): void {
  if (ids.length === 0) return;
  mutate((file) => {
    for (const id of orderByPosition(file, ids).reverse()) outdentDraft(file, id);
  });
}

/** Vrai si toutes les tâches partagent le même parent (condition du déplacement groupé). */
function shareSameParent(file: TeamFile, ids: string[]): boolean {
  const parents = new Set(ids.map((id) => taskById(file, id)?.parentId ?? '∅'));
  return parents.size === 1;
}

/** Déplacer le groupe d'un cran vers le haut. No-op si parents différents. */
export function moveTasksUp(ids: string[]): void {
  if (ids.length === 0) return;
  mutate((file) => {
    if (!shareSameParent(file, ids)) return;
    for (const id of orderByPosition(file, ids)) moveUpDraft(file, id);
  });
}

/** Déplacer le groupe d'un cran vers le bas. No-op si parents différents. */
export function moveTasksDown(ids: string[]): void {
  if (ids.length === 0) return;
  mutate((file) => {
    if (!shareSameParent(file, ids)) return;
    for (const id of orderByPosition(file, ids).reverse()) moveDownDraft(file, id);
  });
}

/**
 * Vrai si la sélection peut être enveloppée dans un groupe : au moins une ligne, toutes au même
 * niveau (même parent). Leurs descendants suivent automatiquement.
 */
export function canEncloseInGroup(file: TeamFile, ids: string[]): boolean {
  return ids.length > 0 && shareSameParent(file, ids);
}

/**
 * « Créer un groupe englobant » : insère un nouveau groupe à la position de la première ligne
 * sélectionnée (même parent), puis y re-parente toute la sélection en conservant son ordre relatif
 * (décalage d'un niveau). No-op si la sélection n'est pas au même niveau. Un seul `mutate`.
 * Retourne l'id du groupe créé, ou null si l'action n'est pas applicable.
 */
export function createEnclosingGroup(ids: string[]): string | null {
  if (ids.length === 0) return null;
  const groupId = newId('g');
  let created = false;
  mutate((file) => {
    if (!canEncloseInGroup(file, ids)) return;
    const ordered = orderByPosition(file, ids);
    const first = taskById(file, ordered[0]!);
    if (!first) return;
    const parentId = first.parentId;
    const group = createTask({
      name: t('tasks.newGroupName'),
      projectId: first.projectId,
      parentId,
      type: 'group',
    });
    group.id = groupId;
    group.order = first.order - 0.5; // se place juste avant la 1ère ligne sélectionnée
    file.tasks.push(group);
    // Re-parenter la sélection sous le groupe en conservant l'ordre d'affichage relatif.
    ordered.forEach((id, i) => {
      const task = taskById(file, id);
      if (task) {
        task.parentId = groupId;
        task.order = i;
      }
    });
    renumberSiblings(file, parentId);
    renumberSiblings(file, groupId);
    created = true;
  });
  return created ? groupId : null;
}

/**
 * « Dégrouper » — l'inverse de {@link createEnclosingGroup} : remonte les enfants directs du groupe d'un
 * niveau (au parent du groupe), à la position qu'occupait le groupe en conservant leur ordre, puis
 * supprime le groupe. No-op si l'id n'est pas un groupe. Un seul `mutate`. Retourne true si dégroupé.
 */
export function dissolveGroup(groupId: string): boolean {
  let ok = false;
  mutate((file) => {
    const group = taskById(file, groupId);
    if (!group || group.type !== 'group') return;
    const parentId = group.parentId;
    const children = file.tasks
      .filter((t) => t.parentId === groupId)
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    children.forEach((child, i) => {
      child.parentId = parentId;
      child.order = group.order + (i + 1) * 0.001; // juste après la place du groupe, ordre conservé
    });
    file.tasks = file.tasks.filter((t) => t.id !== groupId);
    for (const t of file.tasks) t.links = t.links.filter((l) => l.on !== groupId);
    file.ui.collapsed = file.ui.collapsed.filter((c) => c !== groupId);
    renumberSiblings(file, parentId);
    ok = true;
  });
  return ok;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Découpe interne (niveau draft) : transforme `task` (type 'task' datée) en **groupe** et crée deux
 * feuilles `« <nom> (1) »` (avant `at`) et `« <nom> (2) »` (à partir de `at`). L'effort propre est
 * réparti par capacité calendaire (conservé exactement), le réalisé préservé, un bloc à cheval sur `at`
 * est coupé. Les dépendances entrantes de la tâche (ses liens) passent sur la **tête** ; les liens
 * venant d'autres tâches restent posés sur le groupe (agrégat). `order` : tête 0 / queue 2 (un élément
 * inséré prend 1). Retourne les deux feuilles, ou null si `at` ne tombe pas strictement à l'intérieur.
 */
function splitTaskIntoHeadTail(
  file: TeamFile,
  task: Task,
  at: IsoDate,
): { head: Task; tail: Task } | null {
  if (task.type !== 'task' || task.blocks.length === 0) return null;
  const reviewDate = useAppStore.getState().reviewDate ?? todayIso();
  const ctx = createCalcContext(file, reviewDate);
  const resolved = resolveBlocks(ctx, task);
  const span = taskSpan(resolved);
  if (!span || at <= span.start || at > span.end) return null;

  // 1. répartition des blocs tête/queue (un bloc à cheval sur `at` est coupé)
  const headBlocks: Block[] = [];
  const tailBlocks: Block[] = [];
  for (const r of resolved) {
    const b = r.block;
    const cloneAssign = () => b.assignments.map((a) => ({ ...a }));
    if (r.to < at) {
      headBlocks.push({ ...b, to: b.to ?? r.to, assignments: cloneAssign() });
    } else if (b.from >= at) {
      tailBlocks.push({ ...b, assignments: cloneAssign() });
    } else {
      headBlocks.push({ id: newId('b'), from: b.from, to: addDays(at, -1), assignments: cloneAssign() });
      tailBlocks.push({ id: newId('b'), from: at, to: b.to, assignments: cloneAssign() });
    }
  }

  // 2. répartition de l'effort par capacité autour de `at` ; réalisé (< trait de revue) préservé
  let headCap = 0;
  let realizedHead = 0;
  let realizedTail = 0;
  for (const r of resolved) {
    for (let d = r.from; d <= r.to; d = addDays(d, 1)) {
      const cap = effortCapacityOnDay(ctx, task, r.block, d);
      if (d < at) {
        headCap += cap;
        if (d < ctx.today) realizedHead += cap;
      } else if (d < ctx.today) {
        realizedTail += cap;
      }
    }
  }
  const headEffort = round2(headCap);
  const tailEffort = round2(Math.max(0, task.effort - headEffort));
  const baseName = task.name;

  const head = createTask({
    name: `${baseName} (1)`,
    projectId: task.projectId,
    parentId: task.id,
    scheduling: task.scheduling,
  });
  head.blocks = headBlocks.sort((a, b) => a.from.localeCompare(b.from));
  head.effort = headEffort;
  head.remaining = Math.max(0, round2(headEffort - realizedHead));
  head.progress = task.progress;
  head.color = task.color;
  head.links = task.links.map((l) => ({ ...l })); // les dépendances de A → la tête
  head.order = 0;

  const tail = createTask({
    name: `${baseName} (2)`,
    projectId: task.projectId,
    parentId: task.id,
    scheduling: task.scheduling,
  });
  tail.blocks = tailBlocks.sort((a, b) => a.from.localeCompare(b.from));
  tail.effort = tailEffort;
  tail.remaining = Math.max(0, round2(tailEffort - realizedTail));
  tail.progress = task.progress;
  tail.color = task.color;
  tail.order = 2;

  // la tâche d'origine devient un groupe (agrégat) — plus de blocs/effort/liens propres
  task.type = 'group';
  task.blocks = [];
  task.date = null;
  task.links = [];

  file.tasks.push(head, tail);
  return { head, tail };
}

/** Jour ouvré « du milieu » du span (strictement à l'intérieur), pour un découpage par défaut. */
function midSplitDay(span: { start: IsoDate; end: IsoDate }): IsoDate | null {
  const total = diffDays(span.start, span.end);
  if (total < 1) return null;
  return addDays(span.start, Math.max(1, Math.floor(total / 2)));
}

export interface SubtaskFromPointOptions {
  /** Nom de la sous-tâche insérée (défaut : « Nouvelle tâche »). */
  name?: string;
  /** Effort (j-h) de la sous-tâche insérée (défaut 1). */
  effort?: number;
}

/**
 * « Créer une sous-tâche à partir d'ici » : interrompt une tâche au jour `at`. La tâche devient un
 * **groupe** { tête, insérée, queue } (cf. {@link splitTaskIntoHeadTail}), et une sous-tâche est créée
 * dans le trou, reliée `(1) → insérée → (2)` (liens de début, auto-maintenus). No-op (null) si la cible
 * n'est pas une tâche datée dont `at` tombe strictement à l'intérieur. Retourne l'id de l'insérée.
 */
export function createSubtaskFromPoint(
  taskId: string,
  at: IsoDate,
  opts: SubtaskFromPointOptions = {},
): string | null {
  let insertedId: string | null = null;
  mutate((file) => {
    const task = taskById(file, taskId);
    if (!task) return;
    const split = splitTaskIntoHeadTail(file, task, at);
    if (!split) return;
    const { head, tail } = split;

    const reviewDate = useAppStore.getState().reviewDate ?? todayIso();
    const ctx = createCalcContext(file, reviewDate);
    const insEffort = Math.max(0, opts.effort ?? 1);
    const insDays = Math.max(1, Math.ceil(insEffort));

    const inserted = createTask({
      name: opts.name ?? t('tasks.newName'),
      projectId: task.projectId,
      parentId: task.id,
      scheduling: task.scheduling, // hérite du mode de la tâche d'origine
    });
    inserted.effort = insEffort;
    inserted.remaining = insEffort;
    // Mode fixed : dates explicites (bloc fermé). Mode effort : bloc ouvert piloté par le reste.
    inserted.blocks =
      task.scheduling === 'fixed'
        ? [createBlock({ from: at, to: ctx.addWorkingDays(at, insDays - 1) })]
        : [createBlock({ from: at })];
    inserted.order = 1;

    // L'insérée prend `insEffort` j-h **à la place** du début de la queue (effort total conservé : on
    // ne passe pas de 10 à 11 j-h). La queue redémarre après l'insérée et perd cette durée.
    const tailStart = ctx.addWorkingDays(at, insDays);
    if (task.scheduling === 'fixed') {
      // Rogner le DÉBUT des blocs de queue jusqu'à tailStart (sans bouger leur fin) → queue raccourcie.
      tail.blocks = tail.blocks
        .map((b) => (b.from < tailStart ? { ...b, from: tailStart } : b))
        .filter((b) => b.to === null || b.from <= b.to);
    } else {
      // Mode effort : retirer la durée de l'insérée de l'effort/reste de la queue, et la faire
      // redémarrer après l'insérée (le bloc ouvert recalcule une fin plus courte).
      tail.effort = round2(Math.max(0, tail.effort - insEffort));
      tail.remaining = round2(Math.max(0, tail.remaining - insEffort));
      for (const b of tail.blocks) if (b.from < tailStart) b.from = tailStart;
    }

    // liens de début : insérée après la tête, queue après l'insérée (chaîne acyclique)
    inserted.links = [{ on: head.id, type: 'after-end', lag: 0 }];
    tail.links = [{ on: inserted.id, type: 'after-end', lag: 0 }];

    file.tasks.push(inserted);
    insertedId = inserted.id;
  });
  return insertedId;
}

/**
 * Résout un lien cyclique direct A↔B en scindant le successeur. Le nouveau lien voulu fait dépendre
 * `successorId` (A) de `predecessorId` (B), alors que B dépend déjà de A. On scinde A en groupe
 * { tête, queue } : la **queue** prend la nouvelle dépendance vers B, et la dépendance existante de B
 * vers A est **re-pointée sur la tête** (sinon le cycle reviendrait via l'agrégat). Chaîne acyclique
 * `tête → B → queue`. `at` par défaut : milieu du span de A. Retourne l'id de la queue, ou null.
 */
export function resolveCycleBySplit(
  successorId: string,
  predecessorId: string,
  at?: IsoDate,
): string | null {
  // Pré-contrôle (lecture seule) : le scinder ne casse qu'un cycle dont le retour passe par A.
  // On simule le graphe résultant (A→groupe, tête = liens de A, queue → B, liens de B re-pointés
  // sur la tête) et on vérifie qu'il devient acyclique. Sinon on n'agit pas (cycle indirect).
  const file0 = useAppStore.getState().file;
  const succ = file0.tasks.find((t) => t.id === successorId);
  if (!succ || succ.type !== 'task') return null;
  const HEAD = '__sim_head__';
  const TAIL = '__sim_tail__';
  const sim = file0.tasks.map((tk) => {
    if (tk.id === successorId) return { id: tk.id, links: [] as { on: string }[] };
    if (tk.id === predecessorId)
      return { id: tk.id, links: tk.links.map((l) => ({ on: l.on === successorId ? HEAD : l.on })) };
    return { id: tk.id, links: tk.links.map((l) => ({ on: l.on })) };
  });
  sim.push({ id: HEAD, links: succ.links.map((l) => ({ on: l.on })) });
  sim.push({ id: TAIL, links: [{ on: predecessorId }] });
  if (topologicalOrder(sim as unknown as Task[]).cycle) return null;

  let tailId: string | null = null;
  mutate((file) => {
    const task = taskById(file, successorId);
    if (!task || task.type !== 'task') return;
    const reviewDate = useAppStore.getState().reviewDate ?? todayIso();
    const ctx = createCalcContext(file, reviewDate);
    const span = taskSpan(resolveBlocks(ctx, task));
    const cut = at ?? (span ? midSplitDay(span) : null);
    if (!cut) return;
    const split = splitTaskIntoHeadTail(file, task, cut);
    if (!split) return;
    const { head, tail } = split;
    // re-pointer les dépendances de B vers A (groupe) sur la tête, pour casser le cycle
    const predecessor = taskById(file, predecessorId);
    if (predecessor) {
      for (const link of predecessor.links) {
        if (link.on === successorId) link.on = head.id;
      }
    }
    // la queue dépend désormais de B
    tail.links = [...tail.links, { on: predecessorId, type: 'after-end', lag: 0 }];
    tailId = tail.id;
  });
  return tailId;
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

/**
 * Matérialise une tâche/jalon **non planifié** à la date `from` (clic / déplacement d'un ghost de
 * placement). Pose le 1er bloc selon le type, en conservant le `scheduling` de la tâche :
 * - **fixed** → bloc fermé d'1 jour (`{from, to: from}`) : « les dates, c'est moi qui les pose » ;
 * - **effort** → bloc ouvert `{from}` piloté par le reste, avec 1 j-h par défaut s'il est vide ;
 * - **jalon** → date posée.
 * No-op si la cible est déjà planifiée (a un bloc, ou un jalon déjà daté).
 * Retourne l'id du bloc créé (pour enchaîner un geste de drag), ou `null` (jalon / no-op).
 */
export function materializeTaskAt(taskId: string, from: IsoDate): string | null {
  let blockId: string | null = null;
  mutate((file) => {
    const task = taskById(file, taskId);
    if (!task) return;
    if (task.type === 'milestone') {
      if (task.date === null) task.date = from;
      return;
    }
    if (task.type !== 'task' || task.blocks.length > 0) return;
    const block = task.scheduling === 'fixed' ? createBlock({ from, to: from }) : createBlock({ from });
    task.blocks = [block];
    blockId = block.id;
    if (task.scheduling === 'effort' && task.effort <= 0) {
      task.effort = 1;
      task.remaining = 1;
    }
  });
  return blockId;
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

/**
 * Décale dans le temps les barres/jalons de plusieurs tâches d'un coup (glisser groupé du Gantt).
 * Un seul `mutate` = une étape d'undo. Les groupes (sans blocs propres) sont ignorés.
 */
export function shiftTasksDates(ids: string[], deltaDays: number): void {
  if (deltaDays === 0) return;
  mutate((file) => {
    for (const id of ids) {
      const task = taskById(file, id);
      if (!task) continue;
      if (task.type === 'milestone') {
        if (task.date) task.date = addDays(task.date, deltaDays);
      } else if (task.type === 'task') {
        for (const block of task.blocks) {
          block.from = addDays(block.from, deltaDays);
          if (block.to !== null) block.to = addDays(block.to, deltaDays);
        }
        resyncRemainingDraft(file, task);
      }
    }
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
    if (to === null) {
      block.to = null;
      delete block.zero;
    } else if (to < from) {
      // Croisement des bords → bloc « 0 jour » (note/micro-rappel) : point daté, capacité nulle.
      block.to = from;
      block.zero = true;
    } else {
      block.to = to;
      delete block.zero;
    }
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

/**
 * Re-cible un lien : retire le lien `linkIdx` de l'ancien successeur et le pose sur le nouveau,
 * en une seule mutation (un seul undo). La source du lien (`link.on`) ne change pas.
 */
export function relinkSuccessor(
  oldTaskId: string,
  linkIdx: number,
  newTaskId: string,
  link: TaskLink,
): string | null {
  const { file } = useAppStore.getState();
  if (wouldCreateCycle(file.tasks, newTaskId, link.on)) {
    return t('links.cycleRefused');
  }
  mutate((f) => {
    const old = taskById(f, oldTaskId);
    if (old) old.links.splice(linkIdx, 1);
    const target = taskById(f, newTaskId);
    if (!target) return;
    if (target.links.some((l) => l.on === link.on && l.type === link.type)) return;
    target.links.push(link);
  });
  return null;
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
