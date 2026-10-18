import { describe, expect, it } from 'vitest';
import { computeSchedule } from './schedule';
import { fileAsOf } from './asOf';
import { assign, block, person, task, team } from '../testkit';

// Lundi 01/06 = aujourd'hui (date de référence des restes stockés).
const TODAY = '2026-06-01';

const f = () =>
  team({
    resources: [person('alice')],
    tasks: [
      task('t', { effort: 10, remaining: 8, status: 'in_progress', blocks: [block('b', '2026-05-25', null, [assign('alice')])] }),
      task('done', { effort: 2, remaining: 0, status: 'done', blocks: [block('bd', '2026-05-25', '2026-05-26')] }),
      task('fixed', { scheduling: 'fixed', blocks: [block('bf', '2026-06-01', '2026-06-10')] }),
    ],
  });

describe('R1 — reste vu à la date de réunion, sans rien écrire', () => {
  it('date de réunion plus tard : la capacité planifiée entre-temps est consommée', () => {
    const view = fileAsOf(f(), TODAY, '2026-06-03'); // lun + mar travaillés
    expect(view.tasks.find((t) => t.id === 't')!.remaining).toBe(6);
  });

  it('les fins calculées ne bougent pas', () => {
    const end = (date: string) => computeSchedule(f(), date, TODAY).spanByTask.get('t')!.end;
    expect(end('2026-06-03')).toBe(end(TODAY));
    expect(end('2026-05-27')).toBe(end(TODAY));
  });

  it('date de réunion plus tôt : le travail redevient à faire', () => {
    const view = fileAsOf(f(), TODAY, '2026-05-28'); // jeu 28 + ven 29
    expect(view.tasks.find((t) => t.id === 't')!.remaining).toBe(10);
  });

  it('aller-retour neutre : le fichier stocké n’est jamais modifié', () => {
    const file = f();
    const before = JSON.stringify(file);
    computeSchedule(file, '2026-06-05', TODAY);
    expect(JSON.stringify(file)).toBe(before);
    expect(fileAsOf(file, TODAY, TODAY)).toBe(file);
  });

  it('tâches terminées et fixed non concernées ; jamais de reste négatif', () => {
    const file = f();
    const view = fileAsOf(file, TODAY, '2026-07-01');
    expect(view.tasks.find((t) => t.id === 'done')).toBe(file.tasks[1]);
    expect(view.tasks.find((t) => t.id === 'fixed')).toBe(file.tasks[2]);
    expect(view.tasks.find((t) => t.id === 't')!.remaining).toBe(0);
  });
});
