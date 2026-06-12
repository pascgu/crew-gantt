import { describe, expect, it } from 'vitest';
import { summarizeChanges, totalRemaining } from './diff';
import { assign, block, milestone, person, task, team } from '../testkit';
import type { TeamFile } from '../model/types';

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
    expect(summarizeChanges(before, clone(before))).toEqual([]);
  });

  it('avancement : « reste N j-h (était M) »', () => {
    const before = base();
    const after = clone(before);
    after.tasks[0]!.remaining = 7;
    expect(summarizeChanges(before, after)).toEqual(['Maquettes : reste 7 j-h (était 8)']);
  });

  it('réaffectation : « Bob → Alice (80 %) à partir du … »', () => {
    const before = base();
    const after = clone(before);
    // clôture du bloc courant + nouveau bloc avec la nouvelle équipe
    after.tasks[0]!.blocks[0]!.to = '2026-06-12';
    after.tasks[0]!.blocks.push(block('b2', '2026-06-15', null, [assign('r-alice', 80)]));
    expect(summarizeChanges(before, after)).toEqual([
      'Maquettes : Bob → Alice (80 %) à partir du 15/06',
    ]);
  });

  it('statut, note, jalon déplacé, absence, part projet', () => {
    const before = base();
    const after = clone(before);
    after.tasks[0]!.status = 'blocked';
    after.tasks[0]!.notes.push({ date: '2026-06-12', text: 'En attente du client' });
    after.tasks[1]!.date = '2026-07-03';
    after.resources[1]!.exceptions.push({ from: '2026-06-18', to: '2026-06-19', percent: 0, reason: 'Congés' });
    after.resources[1]!.projectShares.push({ projectId: 'pA', from: '2026-07-01', percent: 80 });
    const lines = summarizeChanges(before, after);
    expect(lines).toContain('Maquettes : bloquée');
    expect(lines).toContain('Maquettes : note — En attente du client');
    expect(lines).toContain('Livraison : jalon déplacé au 03/07');
    expect(lines).toContain('Alice : 0 % du 18/06 au 19/06 (Congés)');
    expect(lines).toContain('Alice : 80 % sur Projet A à partir du 01/07');
  });

  it('création et suppression de tâches', () => {
    const before = base();
    const after = clone(before);
    after.tasks.push(task('t2', { name: 'Recette' }));
    after.tasks = after.tasks.filter((t) => t.id !== 't1');
    const lines = summarizeChanges(before, after);
    expect(lines).toContain('Recette : créée');
    expect(lines).toContain('Maquettes : supprimée');
  });
});

describe('totalRemaining', () => {
  it('somme les restes des tâches simples', () => {
    expect(totalRemaining(base())).toBe(8);
  });
});
