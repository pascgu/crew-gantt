import { create } from 'zustand';

type Panel = 'conflicts' | 'impacts' | 'messages' | null;

interface UiState {
  panel: Panel;
  focusConflictTaskId: string | null;
  dismissedProposal: string;
  editingTaskId: string | null;
  openPanel: (p: Panel) => void;
  togglePanel: (p: Exclude<Panel, null>) => void;
  closePanel: () => void;
  openConflicts: (taskId?: string) => void;
  dismissProposal: (key: string) => void;
  setEditingTaskId: (id: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  panel: null,
  focusConflictTaskId: null,
  dismissedProposal: '',
  editingTaskId: null,

  openPanel: (p) => set({ panel: p, focusConflictTaskId: null }),
  togglePanel: (p) =>
    set((s) => ({
      panel: s.panel === p ? null : p,
      focusConflictTaskId: null,
    })),
  closePanel: () => set({ panel: null }),

  openConflicts: (taskId) =>
    set({ panel: 'conflicts', focusConflictTaskId: taskId ?? null }),

  dismissProposal: (key) => set({ dismissedProposal: key }),

  setEditingTaskId: (id) => set({ editingTaskId: id }),
}));
