import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { COLS } from './columns';

export type ColKey = keyof typeof COLS;

const DEFAULT_WIDTHS = { ...COLS } as Record<ColKey, number>;
const MIN_COL = 32;
const MIN_COL_BY_KEY: Partial<Record<ColKey, number>> = { scheduling: 14 };

/** Ordre par défaut des colonnes affichées (`group` n'apparaît pas dans la liste). `name` en tête. */
export const DEFAULT_COLUMN_ORDER: ColKey[] = [
  'name',
  'project',
  'scheduling',
  'estimate',
  'effort',
  'realized',
  'remaining',
  'progress',
  'assignees',
  'start',
  'end',
  'status',
];

/**
 * Répare un ordre éventuellement partiel/ancien : `name` toujours en tête, on garde les clés connues
 * et affichées dans l'ordre fourni, puis on ajoute en fin toute colonne affichée manquante.
 */
export function normalizeOrder(order?: ColKey[]): ColKey[] {
  const allowed = new Set(DEFAULT_COLUMN_ORDER);
  const seen = new Set<ColKey>();
  const out: ColKey[] = [];
  for (const k of order ?? []) {
    if (k !== 'name' && allowed.has(k) && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  for (const k of DEFAULT_COLUMN_ORDER) {
    if (k !== 'name' && !seen.has(k)) out.push(k);
  }
  return ['name', ...out];
}

interface TableState {
  widths: Record<ColKey, number>;
  hidden: ColKey[];
  /** Ordre d'affichage des colonnes (`name` épinglé en première position). */
  order: ColKey[];
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
  /** Flèches ▲/▼ : déplace une colonne d'un cran (jamais avant `name`). */
  moveColumn: (col: ColKey, dir: 'up' | 'down') => void;
  /** Glisser-déposer dans l'en-tête : pose un ordre complet (normalisé). */
  setColumnOrder: (order: ColKey[]) => void;
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
      order: DEFAULT_COLUMN_ORDER,
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

      moveColumn: (col, dir) =>
        set((s) => {
          const i = s.order.indexOf(col);
          if (i < 1) return {}; // `name` (index 0) ou introuvable : pas de déplacement
          const j = dir === 'up' ? i - 1 : i + 1;
          if (j < 1 || j >= s.order.length) return {};
          const next = [...s.order];
          [next[i], next[j]] = [next[j]!, next[i]!];
          return { order: next };
        }),

      setColumnOrder: (order) => set({ order: normalizeOrder(order) }),

      setStatusFilter: (v) => set({ statusFilter: v }),
      setAssigneeFilter: (v) => set({ assigneeFilter: v }),
      setNameQuery: (q) => set({ nameQuery: q }),
      resetWidths: () => set({ widths: DEFAULT_WIDTHS, order: DEFAULT_COLUMN_ORDER }),
      setFontSize: (size) => set({ fontSize: Math.max(9, Math.min(13, size)) }),
    }),
    {
      name: 'crewgantt.ui.columns',
      merge: (persisted, current) => {
        const p = persisted as Partial<TableState>;
        return {
          ...current,
          ...p,
          widths: { ...current.widths, ...(p.widths ?? {}) },
          order: normalizeOrder(p.order),
        };
      },
    },
  ),
);
