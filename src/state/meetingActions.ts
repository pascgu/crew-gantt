import { summarizeChanges, totalRemaining } from '@/core/diff/diff';
import { addDays, todayIso } from '@/core/calendar/dates';
import { newId } from '@/core/model/factory';
import type { Assignment, IsoDate, TeamFile } from '@/core/model/types';
import { getSchedule } from './schedule';
import { useAppStore } from './store';

/**
 * Session de réunion : snapshot du fichier à l'ouverture de l'écran Réunion.
 * Hors store (non versionné par l'undo) — la clôture le compare au présent.
 */
let sessionStart: TeamFile | null = null;

export function ensureMeetingSession(): void {
  sessionStart ??= useAppStore.getState().file;
}

export function hasMeetingChanges(): boolean {
  return sessionStart !== null && sessionStart !== useAppStore.getState().file;
}

/** Clôture : entrée de journal avec résumé automatique + note libre. */
export function closeMeeting(note: string): string[] {
  const { file, mutate } = useAppStore.getState();
  const summary = sessionStart ? summarizeChanges(sessionStart, file) : [];
  mutate((f) => {
    f.journal.push({
      date: todayIso(),
      type: 'meeting',
      summary,
      note,
      remainingTotal: totalRemaining(f),
    });
  });
  sessionStart = useAppStore.getState().file;
  return summary;
}

/**
 * Réaffectation rapide — l'action n°1 des réunions : clôt le bloc courant à
 * `date` et crée le bloc suivant avec la nouvelle équipe. L'historique reste.
 */
export function reassignTask(taskId: string, newAssignments: Assignment[], date: IsoDate): void {
  const { file, mutate } = useAppStore.getState();
  const schedule = getSchedule(file);
  const nextStart = schedule.ctx.nextWorkingDay(addDays(date, 1));
  mutate((f) => {
    const task = f.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const sorted = [...task.blocks].sort((a, b) => a.from.localeCompare(b.from));
    const current = sorted[sorted.length - 1];
    if (current) {
      if (current.from > date) {
        // bloc entièrement à venir : on remplace simplement son équipe
        current.assignments = newAssignments;
        return;
      }
      if (current.to === null || current.to > date) current.to = date;
    }
    task.blocks.push({
      id: newId('b'),
      from: nextStart,
      to: null,
      assignments: newAssignments,
    });
  });
}

/** Saisie rapide d'absence depuis l'écran Réunion. */
export function quickAbsence(
  resourceId: string,
  from: IsoDate,
  to: IsoDate | undefined,
  percent: number,
  reason: string,
): void {
  useAppStore.getState().mutate((f) => {
    const resource = f.resources.find((r) => r.id === resourceId);
    if (!resource) return;
    const exception: (typeof resource.exceptions)[number] = { from, percent };
    if (to && to !== from) exception.to = to;
    if (reason) exception.reason = reason;
    resource.exceptions.push(exception);
    resource.exceptions.sort((a, b) => a.from.localeCompare(b.from));
  });
}

/** Changement rapide de part projet (« Alice passe à 80 % sur le portail en novembre »). */
export function quickShareChange(
  resourceId: string,
  projectId: string,
  percent: number,
  from: IsoDate,
): void {
  useAppStore.getState().mutate((f) => {
    const resource = f.resources.find((r) => r.id === resourceId);
    if (!resource) return;
    resource.projectShares.push({ projectId, from, percent });
    resource.projectShares.sort((a, b) => a.from.localeCompare(b.from));
  });
}
