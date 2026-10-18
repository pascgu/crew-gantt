import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assign, block, person, task, team } from '@/core/testkit';
import { clearHistory, undo, useAppStore } from './store';
import { getSchedule } from './schedule';
import { addBlockToTask, assignTeam, materializeTaskAt, setTaskEffort, setTaskRemaining, setTasksPriority } from './taskActions';
import { closeMeeting } from './meetingActions';

// Mercredi 03/06/2026 = aujourd'hui (horloge figée).
const TODAY = '2026-06-03';

const file = () => useAppStore.getState().file;
const taskOf = (id: string) => file().tasks.find((t) => t.id === id)!;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T10:00:00`));
  useAppStore.getState().replaceFile(
    team({
      resources: [person('alice'), person('bob')],
      tasks: [
        task('a', { effort: 10, remaining: 8, status: 'in_progress', blocks: [block('ba', '2026-06-01', null, [assign('alice')])] }),
        task('b', { effort: 4, remaining: 4, blocks: [block('bb', '2026-06-08', null, [assign('bob')])] }),
        task('u', { effort: 2, remaining: 2 }),
      ],
    }),
    null,
  );
  useAppStore.getState().clearReviewDate();
  clearHistory();
});

afterEach(() => {
  useAppStore.getState().clearReviewDate();
  vi.useRealTimers();
});

describe('R1 — date de réunion = vue, la saisie est convertie', () => {
  it('poser puis retirer une date de réunion ne modifie rien', () => {
    const before = file();
    useAppStore.getState().setReviewDate('2026-06-10');
    useAppStore.getState().clearReviewDate();
    expect(file()).toBe(before);
    expect(useAppStore.getState().dirty).toBe(false);
  });

  it('un reste saisi à la date de réunion est stocké au jour d’aujourd’hui', () => {
    useAppStore.getState().setReviewDate('2026-06-05'); // mer 03 + jeu 04 consommés d'ici là
    const seen = () => getSchedule(file(), '2026-06-05').ctx.file.tasks.find((t) => t.id === 'a')!.remaining;
    expect(seen()).toBe(6);
    setTaskRemaining('a', 5);
    expect(seen()).toBe(5);
    expect(taskOf('a').remaining).toBe(7); // 5 vus le 05 = 7 aujourd'hui
    expect(taskOf('a').effort).toBe(9); // réalisé préservé : effort − 1
  });

  it('R4 — les j-h stockés sont arrondis au centième', () => {
    setTaskEffort('a', 10.123456);
    setTaskRemaining('b', 1.0999999999999996);
    expect(taskOf('a').effort).toBe(10.12);
    expect(taskOf('b').remaining).toBe(1.1);
  });
});

describe('T8 — remplacer l’équipe de toute une sélection, en une étape d’annulation', () => {
  it('toutes les tâches reçoivent exactement la même équipe ; un seul Ctrl+Z', () => {
    assignTeam(['a', 'b'], [assign('alice', 50), assign('bob')]);
    const team = (id: string) => [...taskOf(id).blocks].sort((x, y) => x.from.localeCompare(y.from)).at(-1)!.assignments;
    expect(team('a')).toEqual([assign('alice', 50), assign('bob')]);
    expect(team('b')).toEqual(team('a'));
    undo();
    expect(team('a')).toEqual([assign('alice')]);
    expect(team('b')).toEqual([assign('bob')]);
  });

  it('T9 — une tâche non placée reçoit une équipe prévue, reprise par son premier bloc', () => {
    assignTeam(['u'], [assign('bob', 80)]);
    expect(taskOf('u').plannedAssignments).toEqual([assign('bob', 80)]);
    materializeTaskAt('u', '2026-06-04');
    expect(taskOf('u').blocks[0]!.assignments).toEqual([assign('bob', 80)]);
    expect(taskOf('u').plannedAssignments).toBeUndefined();
  });
});

describe('E5 — « Ajouter un bloc ici » un week-end', () => {
  it('recale sur le jour ouvré suivant', () => {
    addBlockToTask('u', '2026-06-06'); // samedi
    expect(taskOf('u').blocks[0]!.from).toBe('2026-06-08');
  });
});

describe('T2/T3 — priorité de la sélection', () => {
  it('pose la priorité sur toutes les tâches en une action', () => {
    setTasksPriority(['a', 'b'], 'hidden');
    expect([taskOf('a').priority, taskOf('b').priority, taskOf('u').priority]).toEqual(['hidden', 'hidden', 'normal']);
  });
});

describe('T11 — clôture : instantané et résumé depuis la réunion précédente', () => {
  it('la réunion suivante voit ce qui a été fait entre les deux, quel que soit l’ordre des gestes', () => {
    closeMeeting('R1', TODAY);
    const entry = file().journal.at(-1)!;
    expect(entry.snapshot?.tasks['a']).toMatchObject({ status: 'in_progress', remaining: 8 });
    useAppStore.getState().mutate((f) => {
      f.tasks.find((t) => t.id === 'b')!.status = 'done';
    });
    const summary = closeMeeting('R2', TODAY);
    expect(summary).toContain('b : terminée');
    expect(summary.some((l) => l.startsWith('a :'))).toBe(false);
  });
});
