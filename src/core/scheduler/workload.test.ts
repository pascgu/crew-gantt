import { describe, expect, it } from 'vitest';
import { computeSchedule } from './schedule';
import { freeCapacity } from './workload';
import { assign, block, person, task, team } from '../testkit';

describe('freeCapacity', () => {
  it('présence moins charge, par jour, bornée à 0', () => {
    const f = team({
      resources: [person('alice'), person('bob')],
      tasks: [
        // Alice à 50 % toute la semaine
        task('t1', { remaining: 5, effort: 5, blocks: [block('b1', '2026-06-01', null, [assign('alice', 50)])] }),
      ],
    });
    const s = computeSchedule(f, '2026-06-01');
    // Semaine du 01/06 : Alice 5 j de présence, 2,5 consommés
    expect(freeCapacity(s.ctx, s.loadIndex, 'alice', '2026-06-01', '2026-06-07')).toEqual({
      free: 2.5,
      presenceTotal: 5,
    });
    // Bob est totalement libre
    expect(freeCapacity(s.ctx, s.loadIndex, 'bob', '2026-06-01', '2026-06-07').free).toBe(5);
  });

  it('les absences réduisent la présence et donc le libre', () => {
    const alice = person('alice', {
      exceptions: [{ from: '2026-06-01', to: '2026-06-03', percent: 0 }],
    });
    const f = team({ resources: [alice], tasks: [] });
    const s = computeSchedule(f, '2026-06-01');
    expect(freeCapacity(s.ctx, s.loadIndex, 'alice', '2026-06-01', '2026-06-07')).toEqual({
      free: 2,
      presenceTotal: 2,
    });
  });

  it('un jour surchargé ne crédite pas de libre négatif', () => {
    const f = team({
      resources: [person('alice')],
      tasks: [
        task('t1', { projectId: 'pA', remaining: 5, effort: 5, blocks: [block('b1', '2026-06-01', null, [assign('alice')])] }),
        task('t2', { projectId: 'pB', remaining: 5, effort: 5, blocks: [block('b2', '2026-06-01', null, [assign('alice')])] }),
      ],
    });
    const s = computeSchedule(f, '2026-06-01');
    expect(freeCapacity(s.ctx, s.loadIndex, 'alice', '2026-06-01', '2026-06-07').free).toBe(0);
  });
});
