import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ColKey } from '@/ui/table/tableStore';

export type CenterMode = 'unique' | 'perBlock';
export type CenterOverflow = 'none' | 'before' | 'after';

interface GanttColumnsState {
  before: ColKey[];
  after: ColKey[];
  center: ColKey[];
  centerMode: CenterMode;
  centerOverflow: CenterOverflow;
  fontSize: number;

  setBefore: (cols: ColKey[]) => void;
  setAfter: (cols: ColKey[]) => void;
  setCenter: (cols: ColKey[]) => void;
  setCenterMode: (mode: CenterMode) => void;
  setCenterOverflow: (mode: CenterOverflow) => void;
  setFontSize: (size: number) => void;
}

export const useGanttColumnsStore = create<GanttColumnsState>()(
  persist(
    (set) => ({
      before: [],
      after: ['name'],
      center: [],
      centerMode: 'unique',
      centerOverflow: 'none',
      fontSize: 10,

      setBefore: (before) => set({ before }),
      setAfter: (after) => set({ after }),
      setCenter: (center) => set({ center }),
      setCenterMode: (centerMode) => set({ centerMode }),
      setCenterOverflow: (centerOverflow) => set({ centerOverflow }),
      setFontSize: (size) => set({ fontSize: Math.max(9, Math.min(13, size)) }),
    }),
    { name: 'crewgantt.ui.gantt-columns' },
  ),
);
