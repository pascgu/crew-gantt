import { create } from 'zustand';

let _nextId = 1;

export interface Notification {
  id: number;
  kind: 'info' | 'warn';
  message: string;
  detail?: string;
  actions?: { label: string; onClick: () => void; primary?: boolean }[];
  /** Ne s'auto-efface pas tant qu'on n'agit pas. */
  sticky?: boolean;
  read?: boolean;
  ts: number;
}

interface NotificationsState {
  items: Notification[];
  push: (n: Omit<Notification, 'id' | 'ts' | 'read'>) => number;
  dismiss: (id: number) => void;
  markAllRead: () => void;
  clear: () => void;
}

export const useNotifications = create<NotificationsState>((set) => ({
  items: [],

  push: (n) => {
    const id = _nextId++;
    set((s) => ({ items: [...s.items, { ...n, id, ts: Date.now(), read: false }] }));
    return id;
  },

  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

  markAllRead: () =>
    set((s) => ({ items: s.items.map((i) => ({ ...i, read: true })) })),

  clear: () => set({ items: [] }),
}));
