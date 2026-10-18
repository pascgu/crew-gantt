import { buildMeetingSnapshot, summarizeSince, totalRemaining } from '@/core/diff/diff';
import { todayIso } from '@/core/calendar/dates';
import { computeSchedule } from '@/core/scheduler/schedule';
import type { IsoDate, MeetingSnapshot, TeamFile } from '@/core/model/types';
import { getSchedule } from './schedule';
import { useAppStore } from './store';

export interface MeetingReference {
  snapshot: MeetingSnapshot;
  /** Date de la réunion de référence (null : aucune réunion close). */
  since: IsoDate | null;
}

/**
 * Base de comparaison d'une réunion : l'instantané de la dernière réunion close. À défaut (aucune
 * réunion, ou fichier antérieur à la 1.3 sans instantané), l'état du fichier à son ouverture.
 * Ne dépend pas de la session : ce qui a été fait avant d'ouvrir l'onglet Réunion compte.
 */
export function meetingReference(file: TeamFile, fileAtLoad: TeamFile, meetingDate: IsoDate): MeetingReference {
  const meetings = file.journal.filter((e) => e.type === 'meeting');
  const withSnapshot = [...meetings].reverse().find((e) => e.snapshot);
  if (withSnapshot?.snapshot) return { snapshot: withSnapshot.snapshot, since: withSnapshot.date };
  return { snapshot: loadedSnapshot(fileAtLoad, meetingDate), since: meetings.at(-1)?.date ?? null };
}

// Instantané du fichier à l'ouverture, memoïsé (calcul hors du cache principal du planning).
const loadedCache: { file: TeamFile | null; date: string; snapshot: MeetingSnapshot | null } = {
  file: null,
  date: '',
  snapshot: null,
};

function loadedSnapshot(fileAtLoad: TeamFile, meetingDate: IsoDate): MeetingSnapshot {
  if (loadedCache.file !== fileAtLoad || loadedCache.date !== meetingDate || !loadedCache.snapshot) {
    loadedCache.snapshot = buildMeetingSnapshot(computeSchedule(fileAtLoad, meetingDate, todayIso()));
    loadedCache.file = fileAtLoad;
    loadedCache.date = meetingDate;
  }
  return loadedCache.snapshot;
}

/**
 * Clôture : entrée de journal avec résumé automatique (tout ce qui a changé depuis la réunion
 * précédente), note libre, point de burndown et instantané du plan (base de la réunion suivante).
 * Le plan est vu à la date de la réunion.
 */
export function closeMeeting(note: string, meetingDate: IsoDate = todayIso()): string[] {
  const { file, fileAtLoad, mutate } = useAppStore.getState();
  const schedule = getSchedule(file, meetingDate, todayIso());
  const summary = summarizeSince(meetingReference(file, fileAtLoad, meetingDate).snapshot, schedule);
  const snapshot = buildMeetingSnapshot(schedule);
  const remainingTotal = totalRemaining(schedule.ctx.file);
  mutate((f) => {
    f.journal.push({ date: meetingDate, type: 'meeting', summary, note, remainingTotal, snapshot });
  });
  return summary;
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
