import { useMemo } from 'react';
import { useAppStore } from '@/state/store';
import { useSchedule } from '@/state/schedule';
import type { Task } from '@/core/model/types';
import type { Schedule } from '@/core/scheduler/schedule';

export interface GanttRow {
  task: Task;
  depth: number;
  collapsed: boolean;
  hasChildren: boolean;
  /** Jalons descendants à dessiner sur la barre résumé quand le groupe est replié. */
  collapsedMilestones: Task[];
}

/** Lignes visibles : aplatissement − groupes repliés − filtre projets. */
export function buildRows(
  schedule: Schedule,
  collapsedIds: readonly string[],
  projectFilter: readonly string[] | null,
): GanttRow[] {
  const collapsed = new Set(collapsedIds);
  const filter = projectFilter ? new Set(projectFilter) : null;
  const out: GanttRow[] = [];

  const walk = (parentId: string | null, depth: number) => {
    for (const task of schedule.hierarchy.children.get(parentId) ?? []) {
      if (filter && !filter.has(task.projectId)) continue;
      const kids = schedule.hierarchy.children.get(task.id) ?? [];
      const isCollapsed = collapsed.has(task.id);
      out.push({
        task,
        depth,
        collapsed: isCollapsed,
        hasChildren: kids.length > 0,
        collapsedMilestones: isCollapsed
          ? schedule.hierarchy.descendantsOf(task.id).filter((d) => d.type === 'milestone')
          : [],
      });
      if (!isCollapsed) walk(task.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function useGanttRows(): GanttRow[] {
  const schedule = useSchedule();
  const collapsed = useAppStore((s) => s.file.ui.collapsed);
  const filter = useAppStore((s) => s.file.ui.projectFilter);
  return useMemo(() => buildRows(schedule, collapsed, filter), [schedule, collapsed, filter]);
}
