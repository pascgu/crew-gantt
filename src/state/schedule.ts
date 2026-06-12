import { computeSchedule, type Schedule } from '@/core/scheduler/schedule';
import { detectConflicts, splitIgnored, type Conflict } from '@/core/conflicts/detect';
import { todayIso } from '@/core/calendar/dates';
import type { TeamFile } from '@/core/model/types';
import { useAppStore } from './store';

interface Cache {
  file: TeamFile | null;
  today: string;
  schedule: Schedule | null;
  conflicts: Conflict[] | null;
}

const cache: Cache = { file: null, today: '', schedule: null, conflicts: null };

/** Recalcul memoïsé par référence de fichier (les mutations Immer changent la référence). */
export function getSchedule(file: TeamFile, today = todayIso()): Schedule {
  if (file !== cache.file || today !== cache.today) {
    cache.schedule = computeSchedule(file, today);
    cache.conflicts = null;
    cache.file = file;
    cache.today = today;
  }
  return cache.schedule!;
}

export function getConflicts(file: TeamFile, today = todayIso()): Conflict[] {
  const schedule = getSchedule(file, today);
  cache.conflicts ??= detectConflicts(schedule);
  return cache.conflicts;
}

export function useSchedule(): Schedule {
  const file = useAppStore((s) => s.file);
  return getSchedule(file);
}

export function useConflicts(): { active: Conflict[]; ignored: Conflict[] } {
  const file = useAppStore((s) => s.file);
  return splitIgnored(getConflicts(file), file.ui.ignoredConflicts);
}

/** Conflits actifs indexés par tâche (pour les badges). */
export function useConflictsByTask(): Map<string, Conflict[]> {
  const { active } = useConflicts();
  const map = new Map<string, Conflict[]>();
  for (const c of active) {
    if (!c.taskId) continue;
    const list = map.get(c.taskId);
    if (list) list.push(c);
    else map.set(c.taskId, [c]);
  }
  return map;
}
