import { describe, expect, it } from 'vitest';
import { computeSchedule } from './schedule';
import { detectConflicts } from '../conflicts/detect';
import { createDemoTeamFile } from '../model/demo';
import { assign, block, person, task, team } from '../testkit';

describe('computeSchedule — intégration', () => {
  it('calcule le fichier démo sans erreur', () => {
    const file = createDemoTeamFile('2026-06-11');
    const s = computeSchedule(file);
    expect(s.cycle).toBeNull();
    expect(s.planSpan).not.toBeNull();
    // Toutes les tâches non-groupe ont leurs blocs résolus
    for (const t of file.tasks) {
      if (t.type === 'task') {
        expect(s.resolvedByTask.get(t.id)).toHaveLength(t.blocks.length);
      }
    }
    // La détection tourne sans lever
    expect(() => detectConflicts(s, '2026-06-11')).not.toThrow();
  });

  it('expose la charge par ressource et par jour', () => {
    const f = team({
      resources: [
        person('alice', { projectShares: [{ projectId: 'pA', from: '2026-01-01', percent: 60 }] }),
      ],
      tasks: [
        task('t', { remaining: 3, effort: 3, blocks: [block('b', '2026-06-01', null, [assign('alice', 50)])] }),
      ],
    });
    const s = computeSchedule(f);
    const monday = s.loadIndex.get('alice')!.get('2026-06-01')!;
    expect(monday.perProject['pA']).toBeCloseTo(0.3, 10); // 1 × 0,6 × 0,5
    expect(monday.unitsByProject['pA']).toBe(50);
    expect(monday.total).toBeCloseTo(0.3, 10);
    // Samedi : aucun travail indexé
    expect(s.loadIndex.get('alice')!.get('2026-06-06')).toBeUndefined();
  });

  it('étendue du plan = min/max des blocs résolus et jalons', () => {
    const f = team({
      resources: [person('alice')],
      tasks: [
        task('t1', { remaining: 2, effort: 2, blocks: [block('b1', '2026-06-03', null, [assign('alice')])] }),
        task('t2', { remaining: 1, effort: 1, blocks: [block('b2', '2026-06-15', null, [assign('alice')])] }),
      ],
    });
    expect(computeSchedule(f).planSpan).toEqual({ start: '2026-06-03', end: '2026-06-15' });
  });
});
