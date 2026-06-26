import type { Task } from '../model/types';

export interface Hierarchy {
  readonly tasksById: ReadonlyMap<string, Task>;
  /** Enfants directs, triés par `order`. Clé null = racines. */
  readonly children: ReadonlyMap<string | null, Task[]>;
  /** Tous les descendants (récursif) d'une tâche. */
  descendantsOf(taskId: string): Task[];
  /** Profondeur (0 = racine). */
  depthOf(taskId: string): number;
  /** Parcours préfixe complet (ordre d'affichage, profondeur libre). */
  flatten(): { task: Task; depth: number }[];
}

export function buildHierarchy(tasks: Task[]): Hierarchy {
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const children = new Map<string | null, Task[]>();
  for (const task of tasks) {
    // Un parentId orphelin est traité comme une racine (robustesse aux fichiers édités à la main).
    const parent = task.parentId !== null && tasksById.has(task.parentId) ? task.parentId : null;
    const list = children.get(parent);
    if (list) list.push(task);
    else children.set(parent, [task]);
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }

  const descendantsCache = new Map<string, Task[]>();
  function descendantsOf(taskId: string): Task[] {
    const cached = descendantsCache.get(taskId);
    if (cached) return cached;
    const out: Task[] = [];
    const stack = [...(children.get(taskId) ?? [])];
    while (stack.length > 0) {
      const task = stack.shift()!;
      out.push(task);
      const kids = children.get(task.id);
      if (kids) stack.unshift(...kids);
    }
    descendantsCache.set(taskId, out);
    return out;
  }

  function depthOf(taskId: string): number {
    let depth = 0;
    let current = tasksById.get(taskId);
    let guard = 0;
    while (current && current.parentId !== null && tasksById.has(current.parentId)) {
      current = tasksById.get(current.parentId);
      depth += 1;
      if (++guard > 1000) break;
    }
    return depth;
  }

  function flatten(): { task: Task; depth: number }[] {
    const out: { task: Task; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
      for (const task of children.get(parent) ?? []) {
        out.push({ task, depth });
        walk(task.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }

  return { tasksById, children, descendantsOf, depthOf, flatten };
}
