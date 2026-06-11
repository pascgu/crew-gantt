import { create } from 'zustand';
import { temporal } from 'zundo';
import { immer } from 'zustand/middleware/immer';
import { createDemoTeamFile } from '@/core/model/demo';
import { todayIso } from '@/core/calendar/dates';
import type { TeamFile } from '@/core/model/types';

export type TabId = 'gantt' | 'meeting' | 'dashboard' | 'team' | 'settings';

export interface AppState {
  file: TeamFile;
  /** Nom du fichier lié (ex. `monequipe.crewgantt.json`), null si jamais enregistré. */
  fileName: string | null;
  dirty: boolean;
  lastSavedAt: string | null;
  activeTab: TabId;
  selectedTaskId: string | null;
}

export interface AppActions {
  /** Remplace tout le fichier (ouverture, nouveau, restauration). Réinitialise l'historique. */
  replaceFile: (file: TeamFile, fileName: string | null) => void;
  /** Mutation métier générique (Immer) — marque le fichier modifié. */
  mutate: (fn: (file: TeamFile) => void) => void;
  setFileName: (name: string | null) => void;
  markSaved: () => void;
  setActiveTab: (tab: TabId) => void;
  selectTask: (taskId: string | null) => void;
}

export type AppStore = AppState & AppActions;

export const useAppStore = create<AppStore>()(
  temporal(
    immer((set) => ({
      file: createDemoTeamFile(todayIso()),
      fileName: null,
      dirty: false,
      lastSavedAt: null,
      activeTab: 'gantt',
      selectedTaskId: null,

      replaceFile: (file, fileName) =>
        set((s) => {
          s.file = file;
          s.fileName = fileName;
          s.dirty = false;
          s.lastSavedAt = null;
          s.selectedTaskId = null;
        }),

      mutate: (fn) =>
        set((s) => {
          fn(s.file);
          s.dirty = true;
        }),

      setFileName: (name) =>
        set((s) => {
          s.fileName = name;
        }),

      markSaved: () =>
        set((s) => {
          s.dirty = false;
          s.lastSavedAt = new Date().toISOString();
        }),

      setActiveTab: (tab) =>
        set((s) => {
          s.activeTab = tab;
        }),

      selectTask: (taskId) =>
        set((s) => {
          s.selectedTaskId = taskId;
        }),
    })),
    {
      // Seules les données métier sont versionnées par l'undo/redo.
      partialize: (s) => ({ file: s.file }),
      equality: (a, b) => a.file === b.file,
      limit: 1000,
    },
  ),
);

export const undo = () => useAppStore.temporal.getState().undo();
export const redo = () => useAppStore.temporal.getState().redo();
export const clearHistory = () => useAppStore.temporal.getState().clear();
