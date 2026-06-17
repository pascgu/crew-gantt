import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyTeamFile } from '@/core/model/factory';
import { clearHistory, useAppStore } from './store';
import {
  addTask,
  collapseAll,
  convertTaskType,
  deleteTasks,
  expandAll,
  indentTask,
  indentTasks,
  moveTaskDown,
  moveTaskUp,
  moveTasks,
  moveTasksDown,
  moveTasksUp,
  outdentTask,
  outdentTasks,
  setTaskEffort,
  setTaskProgress,
  setTaskRemaining,
  setTaskStatus,
} from './taskActions';

const file = () => useAppStore.getState().file;
const taskOf = (id: string) => file().tasks.find((t) => t.id === id)!;
const rootOrder = () =>
  file()
    .tasks.filter((t) => t.parentId === null)
    .sort((a, b) => a.order - b.order)
    .map((t) => t.id);

beforeEach(() => {
  useAppStore.getState().replaceFile(createEmptyTeamFile('Test'), null);
  clearHistory();
});

describe('moveTaskUp / moveTaskDown', () => {
  it('échange avec le sibling précédent / suivant', () => {
    const a = addTask({});
    const b = addTask({ afterId: a });
    const c = addTask({ afterId: b });
    expect(rootOrder()).toEqual([a, b, c]);

    expect(moveTaskUp(b)).toBe(true);
    expect(rootOrder()).toEqual([b, a, c]);

    expect(moveTaskDown(b)).toBe(true);
    expect(rootOrder()).toEqual([a, b, c]);
  });

  it('refuse aux bords de la fratrie', () => {
    const a = addTask({});
    const b = addTask({ afterId: a });
    expect(moveTaskUp(a)).toBe(false);
    expect(moveTaskDown(b)).toBe(false);
    expect(rootOrder()).toEqual([a, b]);
  });

  it('reste dans sa fratrie (ne traverse pas les niveaux)', () => {
    const g = addTask({ type: 'group' });
    const child = addTask({ parentId: g });
    expect(moveTaskUp(child)).toBe(false);
    expect(taskOf(child).parentId).toBe(g);
  });
});

describe('indentTask / outdentTask', () => {
  it('indente sous le sibling précédent et désindente après son parent', () => {
    const a = addTask({});
    const b = addTask({ afterId: a });

    expect(indentTask(b)).toBe(true);
    expect(taskOf(b).parentId).toBe(a);

    expect(outdentTask(b)).toBe(true);
    expect(taskOf(b).parentId).toBeNull();
    expect(rootOrder()).toEqual([a, b]);
  });

  it("refuse d'indenter sans sibling précédent ou sous un jalon", () => {
    const m = addTask({ type: 'milestone' });
    const b = addTask({ afterId: m });
    expect(indentTask(m)).toBe(false); // pas de sibling précédent
    expect(indentTask(b)).toBe(false); // précédent = jalon
    expect(taskOf(b).parentId).toBeNull();
  });

  it('refuse de désindenter une racine', () => {
    const a = addTask({});
    expect(outdentTask(a)).toBe(false);
  });
});

describe('actions groupées (sélection multiple)', () => {
  it('deleteTasks supprime parent + enfant sans erreur (descendance déjà incluse)', () => {
    const g = addTask({ type: 'group' });
    const child = addTask({ parentId: g });
    const other = addTask({});
    deleteTasks([g, child]);
    expect(file().tasks.map((t) => t.id)).toEqual([other]);
  });

  it('deleteTasks supprime des tâches de parents différents', () => {
    const a = addTask({});
    const b = addTask({ afterId: a });
    const c = addTask({ afterId: b });
    deleteTasks([a, c]);
    expect(rootOrder()).toEqual([b]);
  });

  it('indentTasks indente des tâches de parents différents', () => {
    const a = addTask({});
    const b = addTask({ afterId: a }); // indentable sous a
    const c = addTask({}); // racine séparée…
    const d = addTask({ afterId: c }); // …indentable sous c
    indentTasks([b, d]);
    expect(taskOf(b).parentId).toBe(a);
    expect(taskOf(d).parentId).toBe(c);
  });

  it('outdentTasks désindente la sélection', () => {
    const a = addTask({});
    const b = addTask({ afterId: a });
    indentTask(b);
    expect(taskOf(b).parentId).toBe(a);
    outdentTasks([b]);
    expect(taskOf(b).parentId).toBeNull();
  });

  it('moveTasksUp déplace un groupe de même parent d’un cran', () => {
    const a = addTask({});
    const b = addTask({ afterId: a });
    const c = addTask({ afterId: b });
    const d = addTask({ afterId: c });
    moveTasksUp([c, d]);
    expect(rootOrder()).toEqual([a, c, d, b]);
  });

  it('moveTasksDown déplace un groupe de même parent d’un cran', () => {
    const a = addTask({});
    const b = addTask({ afterId: a });
    const c = addTask({ afterId: b });
    moveTasksDown([a, b]);
    expect(rootOrder()).toEqual([c, a, b]);
  });

  it('moveTasksUp est un no-op si les parents diffèrent', () => {
    const g = addTask({ type: 'group' });
    const child = addTask({ parentId: g });
    const root = addTask({});
    const before = rootOrder();
    moveTasksUp([child, root]);
    expect(rootOrder()).toEqual(before);
    expect(taskOf(child).parentId).toBe(g);
  });

  it('moveTasks dépose la sélection en conservant son ordre (after)', () => {
    const a = addTask({});
    const b = addTask({ afterId: a });
    const c = addTask({ afterId: b });
    const d = addTask({ afterId: c });
    // déposer {a, c} après d → d, a, c (ordre relatif a avant c conservé)
    moveTasks([a, c], d, 'after');
    expect(rootOrder()).toEqual([b, d, a, c]);
  });

  it('moveTasks ré-indente toute la sélection sous une cible (child)', () => {
    const g = addTask({ type: 'group' });
    const a = addTask({});
    const b = addTask({ afterId: a });
    moveTasks([a, b], g, 'child');
    expect(taskOf(a).parentId).toBe(g);
    expect(taskOf(b).parentId).toBe(g);
  });

  it('un geste groupé = une seule étape d’undo', () => {
    const a = addTask({});
    const b = addTask({ afterId: a });
    const c = addTask({ afterId: b });
    clearHistory();
    deleteTasks([a, b]);
    expect(rootOrder()).toEqual([c]);
    useAppStore.temporal.getState().undo();
    expect(rootOrder()).toEqual([a, b, c]);
  });
});

describe('convertTaskType', () => {
  it('tâche → groupe : abandonne les blocs', () => {
    const a = addTask({});
    useAppStore.getState().mutate((f) => {
      f.tasks
        .find((t) => t.id === a)!
        .blocks.push({ id: 'b1', from: '2026-06-01', to: '2026-06-05', assignments: [] });
    });
    expect(convertTaskType(a, 'group')).toBe(true);
    expect(taskOf(a).type).toBe('group');
    expect(taskOf(a).blocks).toHaveLength(0);
  });

  it('tâche → jalon : reprend le début du 1er bloc comme date', () => {
    const a = addTask({});
    useAppStore.getState().mutate((f) => {
      f.tasks
        .find((t) => t.id === a)!
        .blocks.push({ id: 'b1', from: '2026-06-01', to: '2026-06-05', assignments: [] });
    });
    expect(convertTaskType(a, 'milestone')).toBe(true);
    expect(taskOf(a).type).toBe('milestone');
    expect(taskOf(a).date).toBe('2026-06-01');
    expect(taskOf(a).blocks).toHaveLength(0);
  });

  it('refuse jalon si la tâche a des enfants', () => {
    const g = addTask({ type: 'group' });
    addTask({ parentId: g });
    expect(convertTaskType(g, 'milestone')).toBe(false);
    expect(taskOf(g).type).toBe('group');
  });

  it('jalon → tâche : efface la date', () => {
    const m = addTask({ type: 'milestone' });
    useAppStore.getState().mutate((f) => {
      f.tasks.find((t) => t.id === m)!.date = '2026-06-12';
    });
    expect(convertTaskType(m, 'task')).toBe(true);
    expect(taskOf(m).type).toBe('task');
    expect(taskOf(m).date).toBeNull();
  });
});

describe('couplage effort = réalisé + reste', () => {
  function effortTask(effort: number, remaining: number) {
    const id = addTask({});
    useAppStore.getState().mutate((f) => {
      const t = f.tasks.find((x) => x.id === id)!;
      t.scheduling = 'effort';
      t.effort = effort;
      t.remaining = remaining;
      t.progress = 0;
    });
    return id;
  }

  it('setTaskEffort reporte la variation sur le reste, réalisé stable (ex2)', () => {
    const id = effortTask(5, 1); // réalisé = 4
    setTaskEffort(id, 8);
    expect(taskOf(id).effort).toBe(8);
    expect(taskOf(id).remaining).toBe(4); // réalisé 4 conservé
  });

  it('setTaskRemaining reporte la variation sur l’effort, réalisé stable (ex1)', () => {
    const id = effortTask(5, 3); // réalisé = 2
    setTaskRemaining(id, 0.5);
    expect(taskOf(id).remaining).toBe(0.5);
    expect(taskOf(id).effort).toBe(2.5); // réalisé 2 conservé
  });

  it('tâche fixed : effort et reste ne sont pas couplés', () => {
    const id = addTask({});
    useAppStore.getState().mutate((f) => {
      const t = f.tasks.find((x) => x.id === id)!;
      t.scheduling = 'fixed';
      t.effort = 5;
      t.remaining = 3;
    });
    setTaskEffort(id, 8);
    expect(taskOf(id).effort).toBe(8);
    expect(taskOf(id).remaining).toBe(3);
  });

  it('setTaskProgress clampe 0..1 sans toucher effort/reste', () => {
    const id = effortTask(5, 2);
    setTaskProgress(id, 1.5);
    expect(taskOf(id).progress).toBe(1);
    setTaskProgress(id, -0.2);
    expect(taskOf(id).progress).toBe(0);
    expect(taskOf(id).effort).toBe(5);
    expect(taskOf(id).remaining).toBe(2);
  });

  it('done : reste 0 et avancement 100 %, effort intact', () => {
    const id = effortTask(5, 2);
    setTaskStatus(id, 'done');
    expect(taskOf(id).remaining).toBe(0);
    expect(taskOf(id).progress).toBe(1);
    expect(taskOf(id).effort).toBe(5);
  });
});

describe('collapseAll / expandAll', () => {
  it('replie tous les parents puis déplie tout', () => {
    const g1 = addTask({ type: 'group' });
    addTask({ parentId: g1 });
    const g2 = addTask({ type: 'group' });
    addTask({ parentId: g2 });
    addTask({}); // feuille sans enfants

    collapseAll();
    expect(new Set(file().ui.collapsed)).toEqual(new Set([g1, g2]));

    expandAll();
    expect(file().ui.collapsed).toEqual([]);
  });
});
