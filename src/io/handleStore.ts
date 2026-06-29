import { openDB } from 'idb';

/** true si le navigateur supporte queryPermission + stockage de handle en IDB (Chrome/Edge). */
export const supportsHandlePersistence: boolean =
  typeof FileSystemFileHandle !== 'undefined' &&
  'queryPermission' in FileSystemFileHandle.prototype;

export interface RecentFile {
  handle: FileSystemFileHandle;
  name: string;
  openedAt: number;
}

const DB_NAME = 'crewgantt-meta';
const STORE = 'recentFiles';

function db() {
  return openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore(STORE, { keyPath: 'name' });
    },
  });
}

function getMaxRecent(): number {
  const raw = localStorage.getItem('crewgantt.recentFilesCount');
  const n = raw !== null ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 20) : 5;
}

/** Ajoute ou rafraîchit une entrée et tronque à maxCount. No-op si non supporté. */
export async function pushRecentFile(handle: FileSystemFileHandle): Promise<void> {
  if (!supportsHandlePersistence) return;
  try {
    const store = await db();
    const entry: RecentFile = { handle, name: handle.name, openedAt: Date.now() };
    await store.put(STORE, entry);

    const all = (await store.getAll(STORE)) as RecentFile[];
    all.sort((a, b) => b.openedAt - a.openedAt);
    const maxCount = getMaxRecent();
    if (all.length > maxCount) {
      const tx = store.transaction(STORE, 'readwrite');
      for (const r of all.slice(maxCount)) await tx.store.delete(r.name);
      await tx.done;
    }
  } catch {
    // IDB indisponible (navigation privée…) : non bloquant
  }
}

/** Retourne les fichiers récents triés du plus récent au plus ancien. */
export async function getRecentFiles(): Promise<RecentFile[]> {
  if (!supportsHandlePersistence) return [];
  try {
    const all = (await (await db()).getAll(STORE)) as RecentFile[];
    return all.sort((a, b) => b.openedAt - a.openedAt);
  } catch {
    return [];
  }
}

/** Supprime une entrée (fichier introuvable ou supprimé par l'utilisateur). */
export async function removeRecentFile(name: string): Promise<void> {
  try {
    await (await db()).delete(STORE, name);
  } catch {
    // non bloquant
  }
}

/** Met à jour le nombre maximum de fichiers récents et tronque si nécessaire. */
export async function setMaxRecent(n: number): Promise<void> {
  const clamped = Math.max(1, Math.min(20, Math.round(n)));
  localStorage.setItem('crewgantt.recentFilesCount', String(clamped));
  // Tronquer l'IDB si besoin
  if (!supportsHandlePersistence) return;
  try {
    const store = await db();
    const all = (await store.getAll(STORE)) as RecentFile[];
    all.sort((a, b) => b.openedAt - a.openedAt);
    if (all.length > clamped) {
      const tx = store.transaction(STORE, 'readwrite');
      for (const r of all.slice(clamped)) await tx.store.delete(r.name);
      await tx.done;
    }
  } catch {
    // non bloquant
  }
}

export function readMaxRecent(): number {
  return getMaxRecent();
}
