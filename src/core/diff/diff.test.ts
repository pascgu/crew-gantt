import { describe, expect, it } from 'vitest';
import { buildMeetingSnapshot, progressSince, snapshotOf, summarizeChanges, summarizeSince, totalRemaining } from './diff';
import { computeSchedule } from '../scheduler/schedule';
import { assign, block, milestone, person, task, team } from '../testkit';
import type { TeamFile } from '../model/types';

const TODAY = '2026-06-01';

function clone(f: TeamFile): TeamFile {
  return JSON.parse(JSON.stringify(f)) as TeamFile;
}

const base = () =>
  team({
    resources: [person('r-bob', { name: 'Bob' }), person('r-alice', { name: 'Alice' })],
    tasks: [
      task('t1', {
        name: 'Maquettes',
        effort: 10,
        remaining: 8,
        status: 'in_progress',
        blocks: [block('b1', '2026-06-01', null, [assign('r-bob')])],
      }),
      milestone('m1', '2026-06-26', { name: 'Livraison' }),
    ],
  });

describe('summarizeChanges', () => {
  it('rien ne change : résumé vide', () => {
    const before = base();
    expect(summarizeChanges(before, clone(before), TODAY)).toEqual([]);
  });

  it('avancement : « reste N j-h (était M) » et fin avancée', () => {
    const before = base();
    const after = clone(before);
    after.tasks[0]!.remaining = 7;
    expect(summarizeChanges(before, after, TODAY)).toEqual([
      'Maquettes : reste 7 j-h (était 8)',
      'Maquettes : avancée de 1 j (fin le 09/06)',
    ]);
  });

  it('réaffectation : « Bob → Alice (80 %) à partir du … »', () => {
    const before = base();
    const after = clone(before);
    // clôture du bloc courant + nouveau bloc avec la nouvelle équipe
    after.tasks[0]!.blocks[0]!.to = '2026-06-12';
    after.tasks[0]!.blocks.push(block('b2', '2026-06-15', null, [assign('r-alice', 80)]));
    expect(summarizeChanges(before, after, TODAY)).toContain('Maquettes : Bob → Alice (80 %) à partir du 15/06');
  });

  it('statut, note, jalon déplacé, absence, part projet', () => {
    const before = base();
    const after = clone(before);
    after.tasks[0]!.status = 'blocked';
    after.tasks[0]!.notes.push({ date: '2026-06-12', text: 'En attente du client' });
    after.tasks[1]!.date = '2026-07-03';
    after.resources[1]!.exceptions.push({ from: '2026-06-18', to: '2026-06-19', percent: 0, reason: 'Congés' });
    after.resources[1]!.projectShares.push({ projectId: 'pA', from: '2026-07-01', percent: 80 });
    const lines = summarizeChanges(before, after, TODAY);
    expect(lines).toContain('Maquettes : bloquée');
    expect(lines).toContain('Maquettes : note — En attente du client');
    expect(lines).toContain('Livraison : jalon déplacé au 03/07 (+7 j)');
    expect(lines).toContain('Alice : 0 % du 18/06 au 19/06 (Congés)');
    expect(lines).toContain('Alice : 80 % sur Projet A à partir du 01/07');
  });

  it('création et suppression de tâches', () => {
    const before = base();
    const after = clone(before);
    after.tasks.push(task('t2', { name: 'Recette' }));
    after.tasks = after.tasks.filter((t) => t.id !== 't1');
    const lines = summarizeChanges(before, after, TODAY);
    expect(lines).toContain('Recette : créée');
    expect(lines).toContain('Maquettes : supprimée');
  });

  it('reportée : la fin recule (reste ré-estimé à la hausse)', () => {
    const before = base();
    const after = clone(before);
    after.tasks[0]!.remaining = 10;
    expect(summarizeChanges(before, after, TODAY)).toContain('Maquettes : reportée de 2 j (fin le 12/06)');
  });

  it('planifiée : une tâche sans bloc reçoit son premier bloc', () => {
    const before = team({ tasks: [task('t1', { name: 'Doc', scheduling: 'fixed' })] });
    const after = clone(before);
    after.tasks[0]!.blocks = [block('b1', '2026-06-02', '2026-06-03')];
    expect(summarizeChanges(before, after, TODAY)).toContain('Doc : planifiée du 02/06 au 03/06');
  });
});

describe('instantané de réunion (T11)', () => {
  it('ce qui a été fait AVANT la réunion compte : comparaison à l’instantané, pas à la session', () => {
    const before = base();
    const prev = snapshotOf(before, TODAY);
    const after = clone(before);
    after.tasks[0]!.status = 'done';
    after.tasks[0]!.remaining = 0;
    const schedule = computeSchedule(after, TODAY);
    expect(summarizeSince(prev, schedule)).toContain('Maquettes : terminée');
    const progress = progressSince(prev, buildMeetingSnapshot(schedule));
    expect([...progress.done]).toEqual(['t1']);
  });

  it('progressSince : reportées (fin qui recule), pas les terminées', () => {
    const before = base();
    const prev = snapshotOf(before, TODAY);
    const after = clone(before);
    after.tasks[0]!.remaining = 12;
    const progress = progressSince(prev, snapshotOf(after, TODAY));
    expect(progress.postponed.get('t1')).toBe(6); // 4 j ouvrés = 6 j calendaires (week-end)
    expect(progress.done.size).toBe(0);
  });

  it('l’instantané garde statut, reste, dates, équipe et nombre de notes', () => {
    const snap = snapshotOf(base(), TODAY);
    expect(snap.tasks['t1']).toEqual({
      name: 'Maquettes',
      type: 'task',
      status: 'in_progress',
      effort: 10,
      remaining: 8,
      start: '2026-06-01',
      end: '2026-06-10',
      team: [{ resourceId: 'r-bob', units: 100 }],
      notes: 0,
    });
    expect(snap.tasks['m1']).toMatchObject({ type: 'milestone', start: '2026-06-26', end: '2026-06-26' });
    expect(snap.resources['r-bob']).toEqual({ name: 'Bob', exceptions: [], shares: [] });
  });
});

describe('totalRemaining', () => {
  it('somme les restes des tâches simples', () => {
    expect(totalRemaining(base())).toBe(8);
  });

  it('ignore les tâches annulées et celles des projets archivés (hors calculs)', () => {
    const f = base();
    f.tasks.push(task('t2', { remaining: 5, status: 'cancelled' }), task('t3', { remaining: 3, projectId: 'pB' }));
    f.projects[1]!.archived = true;
    expect(totalRemaining(f)).toBe(8);
  });
});
