import { newId } from '@/core/model/factory';
import { todayIso } from '@/core/calendar/dates';
import type { Baseline, TeamFile } from '@/core/model/types';
import { getSchedule } from './schedule';
import { useAppStore } from './store';

const mutate = (fn: (file: TeamFile) => void) => useAppStore.getState().mutate(fn);

/** Fige le plan actuel : blocs résolus, efforts, dates de jalons. */
export function createBaseline(name: string): string {
  const { file } = useAppStore.getState();
  const schedule = getSchedule(file);
  const baseline: Baseline = {
    id: newId('bl'),
    name,
    createdAt: todayIso(),
    active: true,
    tasks: {},
    milestones: {},
  };
  for (const task of file.tasks) {
    if (task.type === 'task') {
      const resolved = schedule.resolvedByTask.get(task.id) ?? [];
      if (resolved.length > 0) {
        baseline.tasks[task.id] = {
          blocks: resolved.map((r) => ({ from: r.from, to: r.to })),
          effort: task.effort,
        };
      }
    } else if (task.type === 'milestone' && task.date) {
      baseline.milestones[task.id] = task.date;
    }
  }
  mutate((f) => {
    for (const b of f.baselines) b.active = false;
    f.baselines.push(baseline);
  });
  return baseline.id;
}

export function setActiveBaseline(id: string | null): void {
  mutate((f) => {
    for (const b of f.baselines) b.active = b.id === id;
  });
}

export function deleteBaseline(id: string): void {
  mutate((f) => {
    f.baselines = f.baselines.filter((b) => b.id !== id);
  });
}

export function activeBaseline(file: TeamFile): Baseline | undefined {
  return file.baselines.find((b) => b.active);
}
