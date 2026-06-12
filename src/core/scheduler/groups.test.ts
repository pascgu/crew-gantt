import { describe, expect, it } from 'vitest';
import { aggregateGroup, progressBarDays, taskProgress, unionIntervals } from './groups';
import { createCalcContext } from './context';
import { resolveBlocks } from './blocks';
import { buildHierarchy } from './hierarchy';
import { block, group, milestone, person, task, team } from '../testkit';
import type { Task } from '../model/types';
import type { ResolvedBlock } from './blocks';

describe('unionIntervals', () => {
  it('fusionne chevauchements et blocs adjacents, garde les trous', () => {
    expect(
      unionIntervals([
        { from: '2026-06-10', to: '2026-06-12' },
        { from: '2026-06-01', to: '2026-06-03' },
        { from: '2026-06-03', to: '2026-06-05' }, // chevauche
        { from: '2026-06-06', to: '2026-06-08' }, // adjacent (05 + 1 = 06)
      ]),
    ).toEqual([
      { from: '2026-06-01', to: '2026-06-08' },
      { from: '2026-06-10', to: '2026-06-12' },
    ]);
  });

  it('vide → vide', () => {
    expect(unionIntervals([])).toEqual([]);
  });

  it('un intervalle englobé disparaît', () => {
    expect(
      unionIntervals([
        { from: '2026-06-01', to: '2026-06-10' },
        { from: '2026-06-03', to: '2026-06-05' },
      ]),
    ).toEqual([{ from: '2026-06-01', to: '2026-06-10' }]);
  });
});

function resolveAll(tasks: Task[]): Map<string, ResolvedBlock[]> {
  const ctx = createCalcContext(team({ resources: [person('alice')], tasks }), '2026-06-01');
  const map = new Map<string, ResolvedBlock[]>();
  for (const t of tasks) if (t.type === 'task') map.set(t.id, resolveBlocks(ctx, t));
  return map;
}

describe('agrégats de groupe (exemples chiffrés du GDD)', () => {
  it('« 4 tâches sur 3 jours avec recouvrement, 6 j-h dont 2 réalisés → barre à 33 % »', () => {
    const tasks = [
      group('g'),
      task('t1', { parentId: 'g', effort: 2, remaining: 0, blocks: [block('b1', '2026-06-01', '2026-06-02')] }),
      task('t2', { parentId: 'g', effort: 1, remaining: 1, blocks: [block('b2', '2026-06-01', '2026-06-01')] }),
      task('t3', { parentId: 'g', effort: 2, remaining: 2, blocks: [block('b3', '2026-06-02', '2026-06-03')] }),
      task('t4', { parentId: 'g', effort: 1, remaining: 1, blocks: [block('b4', '2026-06-03', '2026-06-03')] }),
    ];
    const h = buildHierarchy(tasks);
    const agg = aggregateGroup(h.descendantsOf('g'), resolveAll(tasks));
    expect(agg.effortTotal).toBe(6);
    expect(agg.effortRealized).toBe(2);
    expect(agg.progress).toBeCloseTo(1 / 3, 10);
    expect(agg.intervals).toEqual([{ from: '2026-06-01', to: '2026-06-03' }]);
  });

  it('« tâche de 4 j en deux blocs de 2 j séparés de 5 j, 2 j réalisés → ruban de 9 j, barre à 50 % »', () => {
    // La même règle de rendu s'applique aux tâches simples découpées : ici via taskProgress.
    const t = task('t', {
      effort: 4,
      remaining: 2,
      blocks: [
        block('b1', '2026-06-01', '2026-06-02'),
        block('b2', '2026-06-08', '2026-06-09'),
      ],
    });
    expect(taskProgress(t)).toBeCloseTo(0.5, 10);
    const span = { start: '2026-06-01', end: '2026-06-09' };
    // 9 jours calendaires × 50 % = 4,5 j — la barre s'arrête « dans le trou », c'est voulu.
    expect(progressBarDays(span, taskProgress(t))).toBeCloseTo(4.5, 10);
  });

  it('la barre résumé est découpée comme le travail réel (union, pas enveloppe)', () => {
    const tasks = [
      group('g'),
      task('t1', { parentId: 'g', effort: 2, remaining: 0, blocks: [block('b1', '2026-06-01', '2026-06-02')] }),
      task('t2', { parentId: 'g', effort: 5, remaining: 5, blocks: [block('b2', '2026-06-22', '2026-06-26')] }),
    ];
    const h = buildHierarchy(tasks);
    const agg = aggregateGroup(h.descendantsOf('g'), resolveAll(tasks));
    expect(agg.intervals).toEqual([
      { from: '2026-06-01', to: '2026-06-02' },
      { from: '2026-06-22', to: '2026-06-26' },
    ]);
    expect(agg.span).toEqual({ start: '2026-06-01', end: '2026-06-26' });
  });

  it('groupes imbriqués : les efforts ne sont comptés qu’une fois, jalons ignorés', () => {
    const tasks = [
      group('g'),
      group('sg', { parentId: 'g' }),
      task('t1', { parentId: 'sg', effort: 3, remaining: 1, blocks: [block('b1', '2026-06-01', '2026-06-03')] }),
      milestone('m', '2026-06-30', { parentId: 'g' }),
    ];
    const h = buildHierarchy(tasks);
    const agg = aggregateGroup(h.descendantsOf('g'), resolveAll(tasks));
    expect(agg.effortTotal).toBe(3);
    expect(agg.effortRealized).toBe(2);
    expect(agg.span).toEqual({ start: '2026-06-01', end: '2026-06-03' });
  });

  it('groupe vide : agrégat neutre', () => {
    const agg = aggregateGroup([], new Map());
    expect(agg).toEqual({
      intervals: [],
      span: null,
      effortTotal: 0,
      effortRealized: 0,
      progress: 0,
    });
  });
});

describe('taskProgress', () => {
  it('borne 0..1 et gère l’effort nul', () => {
    expect(taskProgress({ effort: 0, remaining: 0 })).toBe(0);
    expect(taskProgress({ effort: 4, remaining: 6 })).toBe(0);
    expect(taskProgress({ effort: 4, remaining: 0 })).toBe(1);
  });
});
