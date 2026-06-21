import { create } from 'zustand';

type Panel = 'conflicts' | 'impacts' | 'messages' | null;

interface UiState {
  panel: Panel;
  focusConflictTaskId: string | null;
  focusProposalTaskId: string | null;
  dismissedProposal: string;
  editingTaskId: string | null;
  requestScrollTo: string | null;
  openPanel: (p: Panel) => void;
  togglePanel: (p: Exclude<Panel, null>) => void;
  closePanel: () => void;
  openConflicts: (taskId?: string) => void;
  openImpacts: (taskId?: string) => void;
  dismissProposal: (key: string) => void;
  setEditingTaskId: (id: string | null) => void;
  scrollToTask: (id: string) => void;
  clearScrollRequest: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  panel: null,
  focusConflictTaskId: null,
  focusProposalTaskId: null,
  dismissedProposal: '',
  editingTaskId: null,
  requestScrollTo: null,

  openPanel: (p) => set({ panel: p, focusConflictTaskId: null, focusProposalTaskId: null }),
  togglePanel: (p) =>
    set((s) => ({
      panel: s.panel === p ? null : p,
      focusConflictTaskId: null,
      focusProposalTaskId: null,
    })),
  closePanel: () => set({ panel: null }),

  openConflicts: (taskId) =>
    set({ panel: 'conflicts', focusConflictTaskId: taskId ?? null }),

  openImpacts: (taskId) =>
    set({ panel: 'impacts', focusProposalTaskId: taskId ?? null }),

  dismissProposal: (key) => set({ dismissedProposal: key }),

  setEditingTaskId: (id) => set({ editingTaskId: id }),

  scrollToTask: (id) => set({ requestScrollTo: id }),
  clearScrollRequest: () => set({ requestScrollTo: null }),
}));
