import { describe, expect, it } from 'vitest';
import { computeSchedule as computeScheduleRaw } from './schedule';
import { constrainingChain, topologicalOrder, wouldCreateCycle } from './links';
import { assign, block, group, milestone, person, task, team } from '../testkit';
import type { TeamFile } from '../model/types';

function file(tasks: TeamFile['tasks']): TeamFile {
  return team({ resources: [person('alice'), person('bob')], tasks });
}

const computeSchedule = (f: TeamFile) => computeScheduleRaw(f, '2026-06-01');

describe('tri topologique et cycles', () => {
  it('ordonne prédécesseurs avant successeurs', () => {
    const f = file([
      task('c', { links: [{ on: 'b', type: 'after-end', lag: 0 }] }),
      task('a'),
      task('b', { links: [{ on: 'a', type: 'after-end', lag: 0 }] }),
    ]);
    const { order, cycle } = topologicalOrder(f.tasks);
    expect(cycle).toBeNull();
    expect(order!.indexOf('a')).toBeLessThan(order!.indexOf('b'));
    expect(order!.indexOf('b')).toBeLessThan(order!.indexOf('c'));
  });

  it('détecte un cycle et le nomme', () => {
    const f = file([
      task('a', { links: [{ on: 'c', type: 'after-end', lag: 0 }] }),
      task('b', { links: [{ on: 'a', type: 'after-end', lag: 0 }] }),
      task('c', { links: [{ on: 'b', type: 'after-end', lag: 0 }] }),
    ]);
    const { order, cycle } = topologicalOrder(f.tasks);
    expect(order).toBeNull();
    expect(cycle).toHaveLength(3);
    expect(new Set(cycle)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('un lien vers une tâche inexistante est ignoré', () => {
    const f = file([task('a', { links: [{ on: 'fantome', type: 'after-end', lag: 0 }] })]);
    expect(topologicalOrder(f.tasks).cycle).toBeNull();
  });

  it('wouldCreateCycle : direct, transitif, réflexif', () => {
    const tasks = [
      task('a'),
      task('b', { links: [{ on: 'a', type: 'after-end', lag: 0 }] }),
      task('c', { links: [{ on: 'b', type: 'after-end', lag: 0 }] }),
    ];
    expect(wouldCreateCycle(tasks, 'a', 'c')).toBe(true); // a dépendrait de c qui dépend de a
    expect(wouldCreateCycle(tasks, 'a', 'b')).toBe(true);
    expect(wouldCreateCycle(tasks, 'a', 'a')).toBe(true);
    expect(wouldCreateCycle(tasks, 'c', 'a')).toBe(false); // déjà le sens existant
  });
});

describe('date au plus tôt — les 3 types de liens', () => {
  it('« après la fin de » : jour ouvré suivant la fin du prédécesseur', () => {
    const f = file([
      task('pred', { remaining: 5, effort: 5, blocks: [block('b', '2026-06-01', null, [assign('alice')])] }),
      task('succ', { links: [{ on: 'pred', type: 'after-end', lag: 0 }] }),
    ]);
    // pred finit vendredi 05 → succ peut débuter lundi 08
    expect(computeSchedule(f).earliestByTask.get('succ')!.date).toBe('2026-06-08');
  });

  it('lag positif et négatif en jours ouvrés', () => {
    const make = (lag: number) =>
      file([
        task('pred', { remaining: 5, effort: 5, blocks: [block('b', '2026-06-01', null, [assign('alice')])] }),
        task('succ', { links: [{ on: 'pred', type: 'after-end', lag }] }),
      ]);
    expect(computeSchedule(make(2)).earliestByTask.get('succ')!.date).toBe('2026-06-10');
    expect(computeSchedule(make(-2)).earliestByTask.get('succ')!.date).toBe('2026-06-04');
  });

  it('« avec le début de » : même jour que le début du prédécesseur', () => {
    const f = file([
      task('pred', { remaining: 5, effort: 5, blocks: [block('b', '2026-06-03', null, [assign('alice')])] }),
      task('succ', { links: [{ on: 'pred', type: 'with-start', lag: 0 }] }),
      task('succ2', { links: [{ on: 'pred', type: 'with-start', lag: 1 }] }),
    ]);
    const s = computeSchedule(f);
    expect(s.earliestByTask.get('succ')!.date).toBe('2026-06-03');
    expect(s.earliestByTask.get('succ2')!.date).toBe('2026-06-04');
  });

  it('« après N jours de travail de » : ancré en jours travaillés', () => {
    const f = file([
      task('pred', { remaining: 10, effort: 10, blocks: [block('b', '2026-06-01', null, [assign('alice')])] }),
      task('succ', { links: [{ on: 'pred', type: 'after-progress', progressDays: 2, lag: 0 }] }),
    ]);
    // 2 j accumulés le mardi 02 → succ peut débuter le mercredi 03
    expect(computeSchedule(f).earliestByTask.get('succ')!.date).toBe('2026-06-03');
  });

  it('l’ancre reste juste si la source est découpée (trou de 2 semaines)', () => {
    const f = file([
      task('pred', {
        remaining: 8,
        effort: 10,
        blocks: [
          block('b1', '2026-06-01', '2026-06-02', [assign('alice')]),
          block('b2', '2026-06-15', null, [assign('alice')]),
        ],
      }),
      task('succ', { links: [{ on: 'pred', type: 'after-progress', progressDays: 3, lag: 0 }] }),
    ]);
    // cumul : lun 01 = 1, mar 02 = 2, (trou), lun 15 = 3 → succ au plus tôt mardi 16
    expect(computeSchedule(f).earliestByTask.get('succ')!.date).toBe('2026-06-16');
  });

  it('l’ancre à mi-temps avance deux fois moins vite', () => {
    const f = file([
      task('pred', { remaining: 5, effort: 5, blocks: [block('b', '2026-06-01', null, [assign('alice', 50)])] }),
      task('succ', { links: [{ on: 'pred', type: 'after-progress', progressDays: 2, lag: 0 }] }),
    ]);
    // 0,5/j : 2 j-h atteints le jeudi 04 → succ vendredi 05
    expect(computeSchedule(f).earliestByTask.get('succ')!.date).toBe('2026-06-05');
  });

  it('un jalon comme prédécesseur : sa date fait foi', () => {
    const f = file([
      milestone('m', '2026-06-10'),
      task('succ', { links: [{ on: 'm', type: 'after-end', lag: 0 }] }),
    ]);
    expect(computeSchedule(f).earliestByTask.get('succ')!.date).toBe('2026-06-11');
  });

  it('un groupe comme prédécesseur : son union fait foi', () => {
    const f = file([
      group('g'),
      task('t1', { parentId: 'g', remaining: 3, effort: 3, blocks: [block('b', '2026-06-01', null, [assign('alice')])] }),
      task('succ', { links: [{ on: 'g', type: 'after-end', lag: 0 }] }),
    ]);
    expect(computeSchedule(f).earliestByTask.get('succ')!.date).toBe('2026-06-04');
  });

  it('plusieurs liens : le plus contraignant l’emporte (bindingLink)', () => {
    const f = file([
      task('p1', { remaining: 2, effort: 2, blocks: [block('b1', '2026-06-01', null, [assign('alice')])] }),
      task('p2', { remaining: 8, effort: 8, blocks: [block('b2', '2026-06-01', null, [assign('bob')])] }),
      task('succ', {
        links: [
          { on: 'p1', type: 'after-end', lag: 0 },
          { on: 'p2', type: 'after-end', lag: 0 },
        ],
      }),
    ]);
    const e = computeSchedule(f).earliestByTask.get('succ')!;
    expect(e.date).toBe('2026-06-11'); // p2 finit le 10
    expect(e.bindingLink!.on).toBe('p2');
    expect(e.perLink).toHaveLength(2);
  });

  it('prédécesseur sans bloc ni date : contrainte ignorée', () => {
    const f = file([
      task('pred'),
      task('succ', { links: [{ on: 'pred', type: 'after-end', lag: 0 }] }),
    ]);
    expect(computeSchedule(f).earliestByTask.get('succ')!.date).toBeNull();
  });
});

describe('chaîne contraignante d’un jalon', () => {
  it('remonte les liens tant que les tâches sont collées à leur contrainte', () => {
    const f = file([
      task('t1', { remaining: 5, effort: 5, blocks: [block('b1', '2026-06-01', null, [assign('alice')])] }),
      // t2 démarre pile à son « au plus tôt » (lundi 08)
      task('t2', {
        remaining: 5,
        effort: 5,
        links: [{ on: 't1', type: 'after-end', lag: 0 }],
        blocks: [block('b2', '2026-06-08', null, [assign('bob')])],
      }),
      milestone('m', '2026-06-15', { links: [{ on: 't2', type: 'after-end', lag: 0 }] }),
    ]);
    const s = computeSchedule(f);
    const chain = constrainingChain(s.linkInputs, s.earliestByTask, 'm');
    expect(chain.map((c) => c.taskId)).toEqual(['m', 't2', 't1']);
    expect(chain[1]!.viaLink!.on).toBe('t2');
  });

  it('s’arrête à la première tâche qui a de la marge libre', () => {
    const f = file([
      task('t1', { remaining: 2, effort: 2, blocks: [block('b1', '2026-06-01', null, [assign('alice')])] }),
      // t2 démarre le 15 alors qu'elle pourrait démarrer le 03 : marge libre
      task('t2', {
        remaining: 3,
        effort: 3,
        links: [{ on: 't1', type: 'after-end', lag: 0 }],
        blocks: [block('b2', '2026-06-15', null, [assign('bob')])],
      }),
      milestone('m', '2026-06-22', { links: [{ on: 't2', type: 'after-end', lag: 0 }] }),
    ]);
    const s = computeSchedule(f);
    const chain = constrainingChain(s.linkInputs, s.earliestByTask, 'm');
    expect(chain.map((c) => c.taskId)).toEqual(['m', 't2']);
  });

  it('jalon sans lien : chaîne réduite à lui-même', () => {
    const f = file([milestone('m', '2026-06-22')]);
    const s = computeSchedule(f);
    expect(constrainingChain(s.linkInputs, s.earliestByTask, 'm')).toEqual([
      { taskId: 'm', viaLink: null },
    ]);
  });
});
