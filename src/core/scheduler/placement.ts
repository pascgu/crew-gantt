import type { IsoDate, Task } from '../model/types';
import type { Schedule } from './schedule';

/**
 * Ancre d'un nœud existant, vue par un nouveau voisin non planifié :
 * - tâche / groupe → début (ou fin) de son span résolu ;
 * - jalon → sa date.
 * Renvoie `null` si le nœud n'a pas d'étendue (tâche/groupe lui-même non planifié, jalon non daté) :
 * l'appelant remonte alors d'un cran dans la cascade.
 */
function anchorOf(schedule: Schedule, node: Task, wantEnd: boolean): IsoDate | null {
  if (node.type === 'milestone') return node.date ?? null;
  const span = schedule.spanByTask.get(node.id) ?? null;
  if (!span) return null;
  return wantEnd ? span.end : span.start;
}

/**
 * Ancre « Continuité » : calée sur la fratrie/le parent. Cascade (1ère règle qui rend une date) :
 *   1. sœur immédiatement précédente exploitable → son début (tâche/groupe) ou sa date (jalon) ;
 *   2. à défaut, le parent (groupe non vide → début du groupe ; tâche → son début) ;
 *   3. sinon `null` (rien où s'accrocher).
 * Pour un **jalon**, on prend la **fin** au lieu du début (un jalon marque le plus souvent l'achèvement
 * de ce qui précède).
 */
function continuityAnchor(schedule: Schedule, task: Task): IsoDate | null {
  const { hierarchy } = schedule;
  const wantEnd = task.type === 'milestone';

  const siblings = hierarchy.children.get(task.parentId) ?? [];
  const idx = siblings.findIndex((s) => s.id === task.id);
  const prev = idx > 0 ? siblings[idx - 1] : undefined;
  if (prev) {
    const a = anchorOf(schedule, prev, wantEnd);
    if (a) return a;
  }

  if (task.parentId !== null) {
    const parent = hierarchy.tasksById.get(task.parentId);
    if (parent) {
      const a = anchorOf(schedule, parent, wantEnd);
      if (a) return a;
    }
  }

  return null;
}

/**
 * Ancres candidates de placement d'une tâche/jalon **non planifié** (sans bloc, ou jalon sans date).
 * Deux ghosts : « Maintenant » (1ᵉʳ jour ouvré ≥ aujourd'hui) et « Continuité » (cf. {@link continuityAnchor}).
 * Dédoublonnées : si la continuité tombe le même jour que « Maintenant », on ne renvoie qu'une ancre.
 * Toujours ≥ 1 ancre (« Maintenant » est inconditionnel).
 */
export function placementAnchors(schedule: Schedule, task: Task): IsoDate[] {
  const now = schedule.ctx.nextWorkingDay(schedule.ctx.today);
  const continuity = continuityAnchor(schedule, task);
  return continuity && continuity !== now ? [now, continuity] : [now];
}
