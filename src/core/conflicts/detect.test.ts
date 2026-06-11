import { describe, expect, it } from 'vitest';
import { computeSchedule } from '../scheduler/schedule';
import { detectConflicts, splitIgnored, type Conflict } from './detect';
import { assign, block, milestone, person, task, team } from '../testkit';
import type { TeamFile } from '../model/types';

const TODAY = '2026-06-01';

function conflictsOf(f: TeamFile, today = TODAY): Conflict[] {
  return detectConflicts(computeSchedule(f), today);
}

function file(tasks: TeamFile['tasks'], resources = [person('alice'), person('bob')]): TeamFile {
  return team({ resources, tasks });
}

describe('1 — lien violé', () => {
  it('tâche placée avant son point autorisé', () => {
    const f = file([
      task('pred', { remaining: 5, effort: 5, blocks: [block('b1', '2026-06-01', null, [assign('alice')])] }),
      task('succ', {
        remaining: 3,
        effort: 3,
        links: [{ on: 'pred', type: 'after-end', lag: 0 }],
        blocks: [block('b2', '2026-06-03', null, [assign('bob')])],
      }),
    ]);
    const c = conflictsOf(f).find((c) => c.type === 'link-violated');
    expect(c).toMatchObject({ taskId: 'succ', date: '2026-06-08' });
  });

  it('commencer bien APRÈS le point autorisé est normal (lien faible)', () => {
    const f = file([
      task('pred', { remaining: 2, effort: 2, blocks: [block('b1', '2026-06-01', null, [assign('alice')])] }),
      task('succ', {
        remaining: 3,
        effort: 3,
        links: [{ on: 'pred', type: 'after-end', lag: 0 }],
        blocks: [block('b2', '2026-06-22', null, [assign('bob')])],
      }),
    ]);
    expect(conflictsOf(f).filter((c) => c.type === 'link-violated')).toEqual([]);
  });
});

describe('2 — surcharge projet', () => {
  it('Σ units > 100 sur un même projet, même personne, même jour', () => {
    const f = file([
      task('t1', { remaining: 5, effort: 5, blocks: [block('b1', '2026-06-01', null, [assign('alice', 60)])] }),
      task('t2', { remaining: 5, effort: 5, blocks: [block('b2', '2026-06-01', null, [assign('alice', 60)])] }),
    ]);
    const c = conflictsOf(f).find((c) => c.type === 'project-overload');
    expect(c).toMatchObject({ resourceId: 'alice', projectId: 'pA' });
    expect(c!.amount).toBeCloseTo(20, 10);
  });

  it('pas de surcharge entre projets différents (c’est du sur-engagement, pas un conflit)', () => {
    const f = file([
      task('t1', { projectId: 'pA', remaining: 5, effort: 5, blocks: [block('b1', '2026-06-01', null, [assign('alice', 100)])] }),
      task('t2', { projectId: 'pB', remaining: 5, effort: 5, blocks: [block('b2', '2026-06-01', null, [assign('alice', 100)])] }),
    ]);
    const conflicts = conflictsOf(f);
    expect(conflicts.filter((c) => c.type === 'project-overload')).toEqual([]);
    // … mais le sur-engagement est bien signalé en avertissement doux
    const schedule = computeSchedule(f);
    expect(schedule.overEngagements).toHaveLength(1);
    expect(schedule.overEngagements[0]).toMatchObject({ resourceId: 'alice' });
    expect(schedule.overEngagements[0]!.peak).toBeCloseTo(2, 10);
  });

  it('100 % pile : pas de surcharge', () => {
    const f = file([
      task('t1', { remaining: 5, effort: 5, blocks: [block('b1', '2026-06-01', null, [assign('alice', 50)])] }),
      task('t2', { remaining: 5, effort: 5, blocks: [block('b2', '2026-06-01', null, [assign('alice', 50)])] }),
    ]);
    expect(conflictsOf(f).filter((c) => c.type === 'project-overload')).toEqual([]);
  });
});

describe('3 — travail sans capacité', () => {
  it('absence datée pendant un bloc fermé à venir', () => {
    const alice = person('alice', {
      exceptions: [{ from: '2026-06-10', to: '2026-06-12', percent: 0, reason: 'Congés' }],
    });
    const f = file(
      [task('t', { remaining: 5, effort: 5, blocks: [block('b', '2026-06-08', '2026-06-12', [assign('alice')])] })],
      [alice],
    );
    const c = conflictsOf(f).find((c) => c.type === 'no-capacity');
    expect(c).toMatchObject({ taskId: 't', resourceId: 'alice', date: '2026-06-10' });
  });

  it('affectation morte : aucune capacité sur tout le bloc (part projet 0)', () => {
    const alice = person('alice', {
      projectShares: [{ projectId: 'pA', from: '2026-01-01', percent: 0 }],
    });
    const f = file(
      [task('t', { remaining: 5, effort: 5, blocks: [block('b', '2026-06-08', '2026-06-12', [assign('alice')])] })],
      [alice],
    );
    expect(conflictsOf(f).some((c) => c.type === 'no-capacity')).toBe(true);
  });

  it('l’historique ne crie pas : bloc passé ou tâche terminée', () => {
    const alice = person('alice', {
      exceptions: [{ from: '2026-05-06', percent: 0 }],
    });
    const f = file(
      [
        task('t', { remaining: 2, effort: 5, blocks: [block('b', '2026-05-04', '2026-05-08', [assign('alice')])] }),
        task('t2', { status: 'done', remaining: 0, effort: 3, blocks: [block('b2', '2026-06-08', '2026-06-10', [assign('alice')])] }),
      ],
      [alice],
    );
    expect(conflictsOf(f).filter((c) => c.type === 'no-capacity')).toEqual([]);
  });

  it('le motif hebdo (mercredi non travaillé) n’alerte pas', () => {
    const alice = person('alice', { workingDays: [1, 2, 4, 5] });
    const f = file(
      [task('t', { remaining: 4, effort: 4, blocks: [block('b', '2026-06-01', '2026-06-05', [assign('alice')])] })],
      [alice],
    );
    expect(conflictsOf(f).filter((c) => c.type === 'no-capacity')).toEqual([]);
  });
});

describe('4 — effort non casé', () => {
  it('blocs fermés insuffisants pour le reste à faire', () => {
    const f = file([
      task('t', { remaining: 8, effort: 8, blocks: [block('b', '2026-06-01', '2026-06-05', [assign('alice')])] }),
    ]);
    const c = conflictsOf(f).find((c) => c.type === 'effort-overflow');
    expect(c).toMatchObject({ taskId: 't' });
    expect(c!.amount).toBeCloseTo(3, 10); // 8 j-h − 5 jours de capacité
  });

  it('bloc ouvert sans capacité aucune', () => {
    const alice = person('alice', {
      projectShares: [{ projectId: 'pA', from: '2026-01-01', percent: 0 }],
    });
    const f = file(
      [task('t', { remaining: 5, effort: 5, blocks: [block('b', '2026-06-01', null, [assign('alice')])] })],
      [alice],
    );
    expect(conflictsOf(f).some((c) => c.type === 'effort-overflow')).toBe(true);
  });

  it('capacité suffisante : pas de conflit', () => {
    const f = file([
      task('t', { remaining: 5, effort: 5, blocks: [block('b', '2026-06-01', '2026-06-05', [assign('alice')])] }),
    ]);
    expect(conflictsOf(f).filter((c) => c.type === 'effort-overflow')).toEqual([]);
  });
});

describe('5 — deadline menacée', () => {
  it('fin planifiée au-delà de la deadline', () => {
    const f = file([
      task('t', {
        remaining: 10,
        effort: 10,
        deadline: '2026-06-05',
        blocks: [block('b', '2026-06-01', null, [assign('alice')])],
      }),
    ]);
    const c = conflictsOf(f).find((c) => c.type === 'deadline');
    expect(c).toMatchObject({ taskId: 't', date: '2026-06-05' });
    expect(c!.amount).toBe(7); // fin le 12 → 7 jours calendaires de dépassement
  });

  it('dans les temps : rien', () => {
    const f = file([
      task('t', {
        remaining: 4,
        effort: 4,
        deadline: '2026-06-05',
        blocks: [block('b', '2026-06-01', null, [assign('alice')])],
      }),
    ]);
    expect(conflictsOf(f).filter((c) => c.type === 'deadline')).toEqual([]);
  });
});

describe('6 — jalon intenable', () => {
  it('date posée avant le point dérivé des liens', () => {
    const f = file([
      task('t', { remaining: 10, effort: 10, blocks: [block('b', '2026-06-01', null, [assign('alice')])] }),
      milestone('m', '2026-06-05', { links: [{ on: 't', type: 'after-end', lag: 0 }] }),
    ]);
    const c = conflictsOf(f).find((c) => c.type === 'milestone-untenable');
    // t finit le 12 → jalon au plus tôt le 15
    expect(c).toMatchObject({ taskId: 'm', date: '2026-06-15', amount: 10 });
  });

  it('jalon après son point dérivé : tenable', () => {
    const f = file([
      task('t', { remaining: 2, effort: 2, blocks: [block('b', '2026-06-01', null, [assign('alice')])] }),
      milestone('m', '2026-06-30', { links: [{ on: 't', type: 'after-end', lag: 0 }] }),
    ]);
    expect(conflictsOf(f).filter((c) => c.type === 'milestone-untenable')).toEqual([]);
  });
});

describe('7 — tâche non affectée', () => {
  it('aucun bloc du tout', () => {
    const f = file([task('t', { remaining: 5, effort: 5 })]);
    expect(conflictsOf(f).find((c) => c.type === 'unassigned')).toMatchObject({ taskId: 't' });
  });

  it('bloc à venir sans personne', () => {
    const f = file([task('t', { remaining: 5, effort: 5, blocks: [block('b', '2026-06-08', '2026-06-12')] })]);
    expect(conflictsOf(f).find((c) => c.type === 'unassigned')).toMatchObject({
      taskId: 't',
      date: '2026-06-08',
    });
  });

  it('tâche terminée ou affectée : rien', () => {
    const f = file([
      task('done', { status: 'done', remaining: 0, effort: 5, blocks: [block('b1', '2026-06-01', '2026-06-05')] }),
      task('ok', { remaining: 5, effort: 5, blocks: [block('b2', '2026-06-01', null, [assign('alice')])] }),
    ]);
    expect(conflictsOf(f).filter((c) => c.type === 'unassigned')).toEqual([]);
  });
});

describe('ignorer explicitement', () => {
  it('splitIgnored sépare actifs et ignorés par id stable', () => {
    const f = file([task('t', { remaining: 5, effort: 5 })]);
    const conflicts = conflictsOf(f);
    const id = conflicts.find((c) => c.type === 'unassigned')!.id;
    const { active, ignored } = splitIgnored(conflicts, [id]);
    expect(ignored.map((c) => c.id)).toContain(id);
    expect(active.map((c) => c.id)).not.toContain(id);
  });

  it('l’id est stable d’un recalcul à l’autre', () => {
    const f = file([task('t', { remaining: 5, effort: 5 })]);
    const a = conflictsOf(f).find((c) => c.type === 'unassigned')!.id;
    const b = conflictsOf(f).find((c) => c.type === 'unassigned')!.id;
    expect(a).toBe(b);
  });
});
