/**
 * Hook de test — exposé sur `window.__crew` en mode dev uniquement (chargé dynamiquement
 * depuis main.tsx sous `import.meta.env.DEV`, donc absent du build de prod).
 *
 * Sert aux scénarios Playwright (tests/e2e/scenarios) : lire l'état métier et le planning
 * calculé pour vérifier un geste, au lieu de deviner depuis les pixels du SVG.
 * Toutes les valeurs renvoyées sont sérialisables (passent par page.evaluate).
 */
import { todayIso } from '@/core/calendar/dates';
import { splitIgnored } from '@/core/conflicts/detect';
import type { Task } from '@/core/model/types';
import { getConflicts, getSchedule } from '@/state/schedule';
import { redo, undo, useAppStore } from '@/state/store';

function findTask(nameOrId: string): Task | undefined {
  const { tasks } = useAppStore.getState().file;
  return tasks.find((t) => t.id === nameOrId) ?? tasks.find((t) => t.name === nameOrId);
}

function currentSchedule() {
  const s = useAppStore.getState();
  const today = s.reviewDate ?? todayIso();
  return { schedule: getSchedule(s.file, today), today };
}

const api = {
  today: () => todayIso(),
  /** État UI hors fichier (sélection, onglet, date de réunion). */
  ui: () => {
    const s = useAppStore.getState();
    return {
      activeTab: s.activeTab,
      selectedTaskId: s.selectedTaskId,
      selectedTaskIds: [...s.selectedTaskIds],
      reviewDate: s.reviewDate,
      dirty: s.dirty,
      fileName: s.fileName,
    };
  },
  /** Copie JSON du fichier courant. */
  file: () => JSON.parse(JSON.stringify(useAppStore.getState().file)),
  task: (nameOrId: string) => {
    const t = findTask(nameOrId);
    return t ? JSON.parse(JSON.stringify(t)) : null;
  },
  /** Ordre d'affichage : noms des enfants directs d'un parent (null = racine), triés par `order`. */
  children: (parentNameOrId: string | null) => {
    const parentId = parentNameOrId === null ? null : (findTask(parentNameOrId)?.id ?? '__none__');
    return useAppStore
      .getState()
      .file.tasks.filter((t) => t.parentId === parentId)
      .sort((a, b) => a.order - b.order)
      .map((t) => t.name);
  },
  /** Blocs résolus (fin calculée incluse) d'une tâche. */
  blocks: (nameOrId: string) => {
    const t = findTask(nameOrId);
    if (!t) return null;
    const { schedule } = currentSchedule();
    return (schedule.resolvedByTask.get(t.id) ?? []).map((r) => ({
      id: r.block.id,
      from: r.from,
      to: r.to,
      open: r.block.to === null,
      overflow: r.overflow,
      assignments: r.block.assignments.map((a) => ({ ...a })),
    }));
  },
  span: (nameOrId: string) => {
    const t = findTask(nameOrId);
    if (!t) return null;
    const span = currentSchedule().schedule.spanByTask.get(t.id);
    return span ? { start: span.start, end: span.end } : null;
  },
  /** Conflits actifs (non ignorés), avec le nom de la tâche pour lisibilité. */
  conflicts: () => {
    const s = useAppStore.getState();
    const today = s.reviewDate ?? todayIso();
    const { active } = splitIgnored(getConflicts(s.file, today), s.file.ui.ignoredConflicts);
    return active.map((c) => ({ ...c, taskName: c.taskId ? findTask(c.taskId)?.name : undefined }));
  },
  cycle: () => currentSchedule().schedule.cycle,
  canUndo: () => useAppStore.temporal.getState().pastStates.length > 0,
  undo,
  redo,
};

declare global {
  interface Window {
    __crew?: typeof api;
  }
}

window.__crew = api;
