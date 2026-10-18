import { useAppStore } from '@/state/store';
import { serializeTeamFile } from '@/core/model/migrate';
import { clearBackup, writeBackup } from './backup';
import { currentBackupKey, linkedNativePath } from './fileAccess';

const DEBOUNCE_MS = 2000;

let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;
/** Clé sous laquelle cette instance a écrit sa dernière sauvegarde de secours. */
let lastKey: string | null = null;

/**
 * Auto-save : après chaque modification (debounce ~2 s), copie de secours IndexedDB **rangée par
 * fichier** (un programme par fichier, T6 : deux fenêtres ne s'écrasent pas leur secours).
 * Le fichier lié n'est écrit qu'en sauvegarde explicite.
 */
export function startAutosave(): void {
  if (started) return;
  started = true;

  useAppStore.subscribe((state, prev) => {
    if (state.file === prev.file) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), DEBOUNCE_MS);
  });

  // Filet supplémentaire : tentative d'écriture immédiate à la fermeture.
  window.addEventListener('beforeunload', () => void flush());
}

async function flush(): Promise<void> {
  const { file, fileName, dirty } = useAppStore.getState();
  if (!dirty) return;

  let json: string;
  try {
    json = serializeTeamFile(file);
  } catch {
    return; // état transitoirement invalide : on retentera au prochain tick
  }

  const key = currentBackupKey(fileName);
  // Le document a changé d'identité (Enregistrer sous…) : son ancien secours n'a plus lieu d'être.
  if (lastKey && lastKey !== key) void clearBackup(lastKey);
  lastKey = key;
  const path = linkedNativePath();
  await writeBackup(key, {
    json,
    savedAt: new Date().toISOString(),
    fileName,
    dirty: true,
    ...(path ? { path } : {}),
  });
}

/**
 * Efface la sauvegarde de secours écrite par cette instance pour son document précédent (abandonné
 * au profit d'un autre fichier, après confirmation). Ne touche jamais au secours du fichier qu'on
 * vient d'ouvrir : s'il en a un, il est proposé à la restauration.
 */
export async function discardOwnBackup(): Promise<void> {
  const key = lastKey;
  lastKey = null;
  if (key) await clearBackup(key);
}

/** Enregistrement réussi : le secours du document (et celui de son ancien nom) est périmé. */
export async function clearBackupAfterSave(): Promise<void> {
  await discardOwnBackup();
  await clearBackup(currentBackupKey(useAppStore.getState().fileName));
}
