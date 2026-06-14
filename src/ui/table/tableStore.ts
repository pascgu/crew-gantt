import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { COLS } from './columns';

export type ColKey = keyof typeof COLS;

const DEFAULT_WIDTHS = { ...COLS } as Record<ColKey, number>;
const MIN_COL = 32;
const MIN_COL_BY_KEY: Partial<Record<ColKey, number>> = { scheduling: 14 };

interface TableState {
  widths: Record<ColKey, number>;
  hidden: ColKey[];
  /** Filtre statut : tableau de valeurs ou null = tout. */
  statusFilter: string[] | null;
  /** Filtre affectés : tableau d'IDs de ressources ou null = tout. */
  assigneeFilter: string[] | null;
  /** Filtre nom : sous-chaîne (insensible à la casse). */
  nameQuery: string;
  /** Taille de police de la liste des tâches (px). */
  fontSize: number;

  setWidth: (col: ColKey, w: number) => void;
  toggleHidden: (col: ColKey) => void;
  setStatusFilter: (v: string[] | null) => void;
  setAssigneeFilter: (v: string[] | null) => void;
  setNameQuery: (q: string) => void;
  resetWidths: () => void;
  setFontSize: (size: number) => void;
}

export const useTableStore = create<TableState>()(
  persist(
    (set) => ({
      widths: DEFAULT_WIDTHS,
      hidden: [],
      statusFilter: null,
      assigneeFilter: null,
      nameQuery: '',
      fontSize: 11,

      setWidth: (col, w) =>
        set((s) => ({ widths: { ...s.widths, [col]: Math.max(MIN_COL_BY_KEY[col] ?? MIN_COL, w) } })),

      toggleHidden: (col) =>
        set((s) => ({
          hidden: s.hidden.includes(col)
            ? s.hidden.filter((c) => c !== col)
            : [...s.hidden, col],
        })),

      setStatusFilter: (v) => set({ statusFilter: v }),
      setAssigneeFilter: (v) => set({ assigneeFilter: v }),
      setNameQuery: (q) => set({ nameQuery: q }),
      resetWidths: () => set({ widths: DEFAULT_WIDTHS }),
      setFontSize: (size) => set({ fontSize: Math.max(9, Math.min(13, size)) }),
    }),
    {
      name: 'crewgantt.ui.columns',
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<TableState>),
        widths: { ...current.widths, ...((persisted as Partial<TableState>).widths ?? {}) },
      }),
    },
  ),
);
