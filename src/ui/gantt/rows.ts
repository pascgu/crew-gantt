import { useMemo } from 'react';
import { useAppStore } from '@/state/store';
import { useSchedule } from '@/state/schedule';
import { useTableStore } from '@/ui/table/tableStore';
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

export interface RowFilters {
  projectFilter: readonly string[] | null;
  statusFilter: string[] | null;
  assigneeFilter: string[] | null;
  nameQuery: string;
}

/** Lignes visibles : aplatissement − groupes repliés − filtres. */
export function buildRows(
  schedule: Schedule,
  collapsedIds: readonly string[],
  filters: RowFilters,
): GanttRow[] {
  const collapsed = new Set(collapsedIds);
  const { projectFilter, statusFilter, assigneeFilter, nameQuery } = filters;
  const pFilter = projectFilter ? new Set(projectFilter) : null;
  const sFilter = statusFilter && statusFilter.length > 0 ? new Set(statusFilter) : null;
  const aFilter = assigneeFilter && assigneeFilter.length > 0 ? new Set(assigneeFilter) : null;
  const nQuery = nameQuery.trim().toLowerCase();

  const hasFilters = pFilter || sFilter || aFilter || nQuery;

  // Calculer l'ensemble des tâches qui matchent + leurs ancêtres (pour conserver l'arbre)
  let matchedIds: Set<string> | null = null;
  if (hasFilters) {
    matchedIds = new Set<string>();
    const all = [...schedule.hierarchy.tasksById.values()];
    for (const task of all) {
      if (pFilter && !pFilter.has(task.projectId)) continue;
      if (sFilter && task.type !== 'group' && !sFilter.has(task.status)) continue;
      if (nQuery && !task.name.toLowerCase().includes(nQuery)) continue;
      if (aFilter && task.type === 'task') {
        const resolved = schedule.resolvedByTask.get(task.id) ?? [];
        const lastBlock = resolved.length > 0 ? resolved[resolved.length - 1]!.block : null;
        const ids = (lastBlock?.assignments ?? []).map((a) => a.resourceId);
        if (!ids.some((id) => aFilter.has(id))) continue;
      }
      // tâche correspondante + tous ses ancêtres
      matchedIds.add(task.id);
      let parentId = task.parentId;
      while (parentId) {
        if (matchedIds.has(parentId)) break; // ancêtres déjà ajoutés
        matchedIds.add(parentId);
        const parent = all.find((t) => t.id === parentId);
        parentId = parent?.parentId ?? null;
      }
    }
  }

  const out: GanttRow[] = [];

  const walk = (parentId: string | null, depth: number) => {
    for (const task of schedule.hierarchy.children.get(parentId) ?? []) {
      if (matchedIds && !matchedIds.has(task.id)) continue;
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
  const projectFilter = useAppStore((s) => s.file.ui.projectFilter);
  const statusFilter = useTableStore((s) => s.statusFilter);
  const assigneeFilter = useTableStore((s) => s.assigneeFilter);
  const nameQuery = useTableStore((s) => s.nameQuery);

  return useMemo(
    () =>
      buildRows(schedule, collapsed, {
        projectFilter,
        statusFilter,
        assigneeFilter,
        nameQuery,
      }),
    [schedule, collapsed, projectFilter, statusFilter, assigneeFilter, nameQuery],
  );
}
