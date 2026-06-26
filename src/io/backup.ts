import { openDB, type IDBPDatabase } from 'idb';

export interface BackupRecord {
  json: string;
  savedAt: string;
  fileName: string | null;
  /** true = la sauvegarde contient des modifications jamais écrites dans un fichier. */
  dirty: boolean;
}

const DB_NAME = 'crewgantt';
const STORE = 'backup';
const KEY = 'latest';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore(STORE);
    },
  });
  return dbPromise;
}

export async function writeBackup(record: BackupRecord): Promise<void> {
  try {
    await (await db()).put(STORE, record, KEY);
  } catch {
    // IndexedDB indisponible (navigation privée…) : le backup est un filet, pas un mur.
  }
}

export async function readBackup(): Promise<BackupRecord | null> {
  try {
    return ((await (await db()).get(STORE, KEY)) as BackupRecord | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function clearBackup(): Promise<void> {
  try {
    await (await db()).delete(STORE, KEY);
  } catch {
    // idem
  }
}
