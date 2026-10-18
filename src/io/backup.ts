import { openDB, type IDBPDatabase } from 'idb';

export interface BackupRecord {
  json: string;
  savedAt: string;
  fileName: string | null;
  /** true = la sauvegarde contient des modifications jamais écrites dans un fichier. */
  dirty: boolean;
  /** Chemin natif du fichier d'origine (app bureau) : la restauration le relie à nouveau. */
  path?: string;
}

/** Sauvegarde trouvée, avec sa clé (pour la restaurer ou l'effacer). */
export interface KeyedBackup extends BackupRecord {
  key: string;
}

const DB_NAME = 'crewgantt';
const STORE = 'backup';
/**
 * Clé unique des versions ≤ 1.2. Depuis la 1.3, une clé PAR FICHIER (cf. `backupKeyFor`) : deux
 * fenêtres ouvertes sur deux fichiers (un programme par fichier, T6) ne s'écrasent plus leur secours.
 * Une ancienne sauvegarde sous cette clé est encore proposée au démarrage.
 */
export const LEGACY_KEY = 'latest';
/** Préfixe des documents jamais enregistrés (démo, nouveau) : un par instance de l'app. */
export const UNTITLED_PREFIX = 'untitled:';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore(STORE);
    },
  });
  return dbPromise;
}

/**
 * Clé de secours d'un document : son chemin natif (app bureau), sinon son nom de fichier
 * (navigateur), sinon une clé « sans titre » propre à cette instance.
 */
export function backupKeyFor(ref: { path?: string | null; name?: string | null; instanceId: string }): string {
  if (ref.path) return `native:${ref.path.toLowerCase()}`;
  if (ref.name) return `file:${ref.name}`;
  return `${UNTITLED_PREFIX}${ref.instanceId}`;
}

export async function writeBackup(key: string, record: BackupRecord): Promise<void> {
  try {
    await (await db()).put(STORE, record, key);
  } catch {
    // IndexedDB indisponible (navigation privée…) : le backup est un filet, pas un mur.
  }
}

export async function readBackup(key: string): Promise<BackupRecord | null> {
  try {
    return ((await (await db()).get(STORE, key)) as BackupRecord | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Toutes les sauvegardes présentes (toutes fenêtres confondues). */
export async function listBackups(): Promise<KeyedBackup[]> {
  try {
    const database = await db();
    const keys = (await database.getAllKeys(STORE)) as string[];
    const out: KeyedBackup[] = [];
    for (const key of keys) {
      const record = (await database.get(STORE, key)) as BackupRecord | undefined;
      if (record) out.push({ ...record, key });
    }
    return out;
  } catch {
    return [];
  }
}

export async function clearBackup(key: string): Promise<void> {
  try {
    await (await db()).delete(STORE, key);
  } catch {
    // idem
  }
}
