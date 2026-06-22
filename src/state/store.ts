import { create } from 'zustand';
import { temporal } from 'zundo';
import { immer } from 'zustand/middleware/immer';
import { createDemoTeamFile } from '@/core/model/demo';
import { todayIso } from '@/core/calendar/dates';
import type { IsoDate, TeamFile } from '@/core/model/types';

export type TabId = 'gantt' | 'meeting' | 'dashboard' | 'team' | 'settings';

export interface AppState {
  file: TeamFile;
  /** Nom du fichier lié (ex. `monequipe.cgan`), null si jamais enregistré. */
  fileName: string | null;
  dirty: boolean;
  lastSavedAt: string | null;
  activeTab: TabId;
  /** Tâche ancre (panneau, boutons « + niveau », point d'ancrage des plages). */
  selectedTaskId: string | null;
  /** Ensemble de la sélection multiple. Contient toujours `selectedTaskId` quand non-null. */
  selectedTaskIds: string[];
  /** Ressource à mettre en évidence dans l'onglet Équipe (hors undo). */
  focusResourceId: string | null;
  /** Date de réunion active — frontière passé/futur dans le Gantt (hors undo). Null = aujourd'hui. */
  reviewDate: IsoDate | null;
}

export interface AppActions {
  /** Remplace tout le fichier (ouverture, nouveau, restauration). Réinitialise l'historique. */
  replaceFile: (file: TeamFile, fileName: string | null) => void;
  /** Mutation métier générique (Immer) — marque le fichier modifié. */
  mutate: (fn: (file: TeamFile) => void) => void;
  setFileName: (name: string | null) => void;
  markSaved: () => void;
  setActiveTab: (tab: TabId) => void;
  /** Sélection simple : remplace toute la sélection par cette tâche (ou la vide). */
  selectTask: (taskId: string | null) => void;
  /** Ctrl-clic : ajoute/retire une tâche de la sélection ; déplace l'ancre. */
  toggleTaskSelection: (taskId: string) => void;
  /** Maj-clic / Maj-flèche : remplace la sélection par une plage, garde l'ancre. */
  setSelectedRange: (taskIds: string[], anchorId: string | null) => void;
  /** Ouvre l'onglet Équipe et met en évidence la ressource `id`. */
  focusResource: (id: string) => void;
  clearFocusResource: () => void;
  /** Pose la date de réunion comme frontière passé/futur. */
  setReviewDate: (date: IsoDate) => void;
  clearReviewDate: () => void;
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
      selectedTaskIds: [],
      focusResourceId: null,
      reviewDate: null,

      replaceFile: (file, fileName) =>
        set((s) => {
          s.file = file;
          s.fileName = fileName;
          s.dirty = false;
          s.lastSavedAt = null;
          s.selectedTaskId = null;
          s.selectedTaskIds = [];
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
          s.selectedTaskIds = taskId ? [taskId] : [];
        }),

      toggleTaskSelection: (taskId) =>
        set((s) => {
          const i = s.selectedTaskIds.indexOf(taskId);
          if (i >= 0) {
            s.selectedTaskIds.splice(i, 1);
            if (s.selectedTaskId === taskId) {
              s.selectedTaskId = s.selectedTaskIds[s.selectedTaskIds.length - 1] ?? null;
            }
          } else {
            s.selectedTaskIds.push(taskId);
            s.selectedTaskId = taskId;
          }
        }),

      setSelectedRange: (taskIds, anchorId) =>
        set((s) => {
          s.selectedTaskIds = taskIds;
          s.selectedTaskId = anchorId;
        }),

      focusResource: (id) =>
        set((s) => {
          s.activeTab = 'team';
          s.focusResourceId = id;
        }),

      clearFocusResource: () =>
        set((s) => {
          s.focusResourceId = null;
        }),

      setReviewDate: (date) =>
        set((s) => {
          s.reviewDate = date;
        }),

      clearReviewDate: () =>
        set((s) => {
          s.reviewDate = null;
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
