import { useMemo } from 'react';
import { maskedTaskIds } from '@/core/model/visibility';
import { computeSchedule, type Schedule } from '@/core/scheduler/schedule';
import { detectConflicts, splitIgnored, type Conflict } from '@/core/conflicts/detect';
import { todayIso } from '@/core/calendar/dates';
import type { TeamFile } from '@/core/model/types';
import { useAppStore } from './store';

interface Cache {
  file: TeamFile | null;
  today: string;
  ref: string;
  schedule: Schedule | null;
  conflicts: Conflict[] | null;
}

const cache: Cache = { file: null, today: '', ref: '', schedule: null, conflicts: null };

/**
 * Recalcul memoïsé par référence de fichier (les mutations Immer changent la référence).
 * `today` = présent du calcul (date de réunion si posée) ; `ref` = date à laquelle valent les restes
 * stockés (le vrai aujourd'hui) — s'ils diffèrent, les restes sont vus à la date de réunion (R1).
 */
export function getSchedule(file: TeamFile, today = todayIso(), ref = todayIso()): Schedule {
  if (file !== cache.file || today !== cache.today || ref !== cache.ref) {
    cache.schedule = computeSchedule(file, today, ref);
    cache.conflicts = null;
    cache.file = file;
    cache.today = today;
    cache.ref = ref;
  }
  return cache.schedule!;
}

export function getConflicts(file: TeamFile, today = todayIso(), ref = todayIso()): Conflict[] {
  const schedule = getSchedule(file, today, ref);
  cache.conflicts ??= detectConflicts(schedule);
  return cache.conflicts;
}

/** Planning courant de l'app (vu à la date de réunion si elle est posée). */
export function currentSchedule(): Schedule {
  const { file, reviewDate } = useAppStore.getState();
  return getSchedule(file, reviewDate ?? todayIso());
}

export function useSchedule(): Schedule {
  const file = useAppStore((s) => s.file);
  const reviewDate = useAppStore((s) => s.reviewDate);
  return getSchedule(file, reviewDate ?? todayIso());
}

export function useConflicts(): { active: Conflict[]; ignored: Conflict[] } {
  const file = useAppStore((s) => s.file);
  const reviewDate = useAppStore((s) => s.reviewDate);
  return splitIgnored(getConflicts(file, reviewDate ?? todayIso()), file.ui.ignoredConflicts);
}

/**
 * Conflits actifs séparés selon que leur tâche est masquée ou non : une tâche masquée (« hors vue »)
 * garde ses conflits, comptés à part (« ⚠ 5 (+2 masquées) ») plutôt que de disparaître en silence.
 */
export function useActiveConflictsByVisibility(): { visible: Conflict[]; masked: Conflict[] } {
  const { active } = useConflicts();
  const tasks = useAppStore((s) => s.file.tasks);
  return useMemo(() => {
    const maskedIds = maskedTaskIds(tasks);
    const visible: Conflict[] = [];
    const masked: Conflict[] = [];
    for (const c of active) (c.taskId && maskedIds.has(c.taskId) ? masked : visible).push(c);
    return { visible, masked };
  }, [active, tasks]);
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
