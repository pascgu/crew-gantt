import { describe, expect, it } from 'vitest';
import { computeSchedule } from './schedule';
import { placementAnchors } from './placement';
import { block, group, milestone, task, team } from '../testkit';

const TODAY = '2026-06-01'; // lundi

function anchors(file: Parameters<typeof computeSchedule>[0], id: string): string[] {
  const s = computeSchedule(file, TODAY);
  const t = file.tasks.find((x) => x.id === id)!;
  return placementAnchors(s, t);
}

describe('placementAnchors', () => {
  it('sans fratrie ni parent : seulement « Maintenant » (aujourd’hui ouvré)', () => {
    const f = team({ tasks: [task('t1', { order: 0 })] });
    expect(anchors(f, 't1')).toEqual([TODAY]);
  });

  it('week-end : « Maintenant » glisse au prochain jour ouvré', () => {
    const f = team({ tasks: [task('t1')] });
    const s = computeSchedule(f, '2026-06-06'); // samedi
    expect(placementAnchors(s, f.tasks[0]!)).toEqual(['2026-06-08']); // lundi
  });

  it('tâche : continuité = début de la sœur précédente', () => {
    const f = team({
      tasks: [
        task('prev', { order: 0, scheduling: 'fixed', blocks: [block('b', '2026-06-10', '2026-06-12')] }),
        task('t', { order: 1 }),
      ],
    });
    expect(anchors(f, 't')).toEqual([TODAY, '2026-06-10']);
  });

  it('jalon : continuité = FIN de la sœur précédente', () => {
    const f = team({
      tasks: [
        task('prev', { order: 0, scheduling: 'fixed', blocks: [block('b', '2026-06-10', '2026-06-12')] }),
        milestone('m', '', { order: 1, date: null }),
      ],
    });
    expect(anchors(f, 'm')).toEqual([TODAY, '2026-06-12']);
  });

  it('continuité = date de la sœur jalon précédente', () => {
    const f = team({
      tasks: [milestone('m1', '2026-06-20', { order: 0 }), task('t', { order: 1 })],
    });
    expect(anchors(f, 't')).toEqual([TODAY, '2026-06-20']);
  });

  it('dédoublonnage : continuité = aujourd’hui → une seule ancre', () => {
    const f = team({
      tasks: [
        task('prev', { order: 0, scheduling: 'fixed', blocks: [block('b', TODAY, '2026-06-03')] }),
        task('t', { order: 1 }),
      ],
    });
    expect(anchors(f, 't')).toEqual([TODAY]);
  });

  it('1er enfant d’un groupe non vide : continuité = début du groupe', () => {
    const f = team({
      tasks: [
        group('g', { order: 0 }),
        task('t1', { parentId: 'g', order: 0 }),
        task('c2', { parentId: 'g', order: 1, scheduling: 'fixed', blocks: [block('b', '2026-06-15', '2026-06-18')] }),
      ],
    });
    // t1 n'a pas de sœur précédente → on remonte au groupe, dont le span vient de c2.
    expect(anchors(f, 't1')).toEqual([TODAY, '2026-06-15']);
  });

  it('sœur précédente non planifiée + parent absent : continuité ignorée', () => {
    const f = team({
      tasks: [task('empty', { order: 0 }), task('t', { order: 1 })],
    });
    expect(anchors(f, 't')).toEqual([TODAY]);
  });
});
