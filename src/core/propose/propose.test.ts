import { describe, expect, it } from 'vitest';
import { proposePlan } from './propose';
import { assign, block, milestone, person, task, team } from '../testkit';
import type { TeamFile } from '../model/types';

const TODAY = '2026-06-01';

function file(tasks: TeamFile['tasks'], resources = [person('alice'), person('bob')]): TeamFile {
  return team({ resources, tasks });
}

describe('proposePlan — stabilité', () => {
  it('plan sain : aucune proposition', () => {
    const f = file([
      task('t1', { remaining: 5, effort: 5, blocks: [block('b1', '2026-06-01', null, [assign('alice')])] }),
      task('t2', {
        remaining: 3,
        effort: 3,
        links: [{ on: 't1', type: 'after-end', lag: 0 }],
        blocks: [block('b2', '2026-06-15', null, [assign('bob')])], // marge libre : normal
      }),
    ]);
    expect(proposePlan(f, TODAY)).toBeNull();
  });

  it('un découpage volontaire sain n’est pas écrasé', () => {
    const f = file([
      task('t', {
        remaining: 4,
        effort: 4,
        blocks: [
          block('b1', '2026-06-01', '2026-06-02', [assign('alice')]),
          block('b2', '2026-06-15', null, [assign('alice')]),
        ],
      }),
    ]);
    expect(proposePlan(f, TODAY)).toBeNull();
  });

  it('cycle de liens : pas de proposition', () => {
    const f = file([
      task('a', { links: [{ on: 'b', type: 'after-end', lag: 0 }] }),
      task('b', { links: [{ on: 'a', type: 'after-end', lag: 0 }] }),
    ]);
    expect(proposePlan(f, TODAY)).toBeNull();
  });
});

describe('proposePlan — découpe autour des absences', () => {
  it('découpe un bloc autour d’une absence datée', () => {
    const alice = person('alice', {
      exceptions: [{ from: '2026-06-03', to: '2026-06-04', percent: 0, reason: 'Congés' }],
    });
    const f = file(
      [task('t', { remaining: 5, effort: 5, blocks: [block('b', '2026-06-01', '2026-06-05', [assign('alice')])] })],
      [alice],
    );
    const proposal = proposePlan(f, TODAY)!;
    expect(proposal).not.toBeNull();
    const change = proposal.changes[0]!;
    // lun-mar travaillés, absence mer-jeu, reprise vendredi → 2 blocs
    expect(change.blocks).toHaveLength(2);
    expect(change.blocks![0]).toMatchObject({ from: '2026-06-01', to: '2026-06-02' });
    expect(change.blocks![1]).toMatchObject({ from: '2026-06-05', to: null });
    expect(change.newBlockCount).toBe(2);
  });

  it('garde les blocs passés intacts et tronque le bloc à cheval', () => {
    const alice = person('alice', {
      exceptions: [{ from: '2026-06-11', to: '2026-06-12', percent: 0 }],
    });
    const f = file(
      [
        task('t', {
          // assez de reste pour que le travail s'étende au-delà de l'absence des 11-12/06
          remaining: 11,
          effort: 14,
          blocks: [
            block('b0', '2026-05-18', '2026-05-20', [assign('alice')]), // passé
            block('b1', '2026-05-28', null, [assign('alice')]), // à cheval sur today
          ],
        }),
      ],
      [alice],
    );
    const proposal = proposePlan(f, TODAY)!;
    const blocks = proposal.changes[0]!.blocks!;
    // passé conservé tel quel
    expect(blocks[0]).toMatchObject({ id: 'b0', from: '2026-05-18', to: '2026-05-20' });
    // part passée du bloc à cheval tronquée à hier
    expect(blocks[1]).toMatchObject({ id: 'b1', from: '2026-05-28', to: '2026-05-31' });
    // reprise aujourd'hui, découpée autour de l'absence des 11-12/06
    expect(blocks[2]).toMatchObject({ from: '2026-06-01', to: '2026-06-10' });
    expect(blocks[3]).toMatchObject({ from: '2026-06-15', to: null });
  });
});

describe('proposePlan — liens violés et cascade', () => {
  it('pousse une tâche à son point autorisé', () => {
    const f = file([
      task('pred', { remaining: 5, effort: 5, blocks: [block('b1', '2026-06-01', null, [assign('alice')])] }),
      task('succ', {
        remaining: 3,
        effort: 3,
        links: [{ on: 'pred', type: 'after-end', lag: 0 }],
        blocks: [block('b2', '2026-06-03', null, [assign('bob')])], // avant la fin de pred
      }),
    ]);
    const proposal = proposePlan(f, TODAY)!;
    const change = proposal.changes.find((c) => c.taskId === 'succ')!;
    expect(change.newStart).toBe('2026-06-08');
  });

  it('cascade : pousser A pousse B pousse le jalon', () => {
    const alice = person('alice', {
      exceptions: [{ from: '2026-06-02', to: '2026-06-08', percent: 0 }],
    });
    const f = file(
      [
        // a : 2 j-h, démarre le 01 mais absence 02-08 → finit le 09
        task('a', { remaining: 2, effort: 2, blocks: [block('ba', '2026-06-01', null, [assign('alice')])] }),
        // b : collé à a (après la fin), démarré au plus tôt actuel (03/06)
        task('b', {
          remaining: 2,
          effort: 2,
          links: [{ on: 'a', type: 'after-end', lag: 0 }],
          blocks: [block('bb', '2026-06-03', null, [assign('bob')])],
        }),
        milestone('m', '2026-06-05', { links: [{ on: 'b', type: 'after-end', lag: 0 }] }),
      ],
      [alice, person('bob')],
    );
    const proposal = proposePlan(f, TODAY)!;
    // a est découpée (01 puis 09) → fin 09/06
    const a = proposal.changes.find((c) => c.taskId === 'a')!;
    expect(a.newEnd).toBe('2026-06-09');
    // b poussée après la fin proposée de a → 10/06, finit 11/06
    const b = proposal.changes.find((c) => c.taskId === 'b')!;
    expect(b.newStart).toBe('2026-06-10');
    expect(b.newEnd).toBe('2026-06-11');
    // le jalon suit : au plus tôt le 12/06
    const m = proposal.changes.find((c) => c.taskId === 'm')!;
    expect(m.date).toBe('2026-06-12');
  });
});

describe('proposePlan — périmètre', () => {
  it('ne touche ni au fixed, ni au terminé, ni au non affecté', () => {
    const alice = person('alice', { exceptions: [{ from: '2026-06-03', percent: 0 }] });
    const f = file(
      [
        task('fixed', {
          scheduling: 'fixed',
          remaining: 5,
          effort: 5,
          blocks: [block('b1', '2026-06-01', '2026-06-05', [assign('alice')])],
        }),
        task('done', {
          status: 'done',
          remaining: 0,
          effort: 5,
          blocks: [block('b2', '2026-06-01', '2026-06-05', [assign('alice')])],
        }),
        task('unmanned', { remaining: 5, effort: 5, blocks: [block('b3', '2026-06-01', null)] }),
      ],
      [alice],
    );
    expect(proposePlan(f, TODAY)).toBeNull();
  });

  it('liste les deadlines encore menacées dans le plan proposé', () => {
    const alice = person('alice', {
      exceptions: [{ from: '2026-06-08', to: '2026-06-19', percent: 0 }],
    });
    const f = file(
      [
        task('t', {
          remaining: 8,
          effort: 8,
          deadline: '2026-06-12',
          blocks: [block('b', '2026-06-01', '2026-06-10', [assign('alice')])],
        }),
      ],
      [alice],
    );
    const proposal = proposePlan(f, TODAY)!;
    expect(proposal.threatenedDeadlines).toHaveLength(1);
    expect(proposal.threatenedDeadlines[0]).toMatchObject({ taskId: 't', deadline: '2026-06-12' });
  });
});
