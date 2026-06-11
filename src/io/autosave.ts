import { useAppStore } from '@/state/store';
import { serializeTeamFile } from '@/core/model/migrate';
import { writeBackup } from './backup';
import { hasLinkedFile, writeLinkedFile } from './fileAccess';

const DEBOUNCE_MS = 2000;

let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;

/**
 * Auto-save : après chaque modification (debounce ~2 s), copie IndexedDB
 * systématique + réécriture du fichier lié s'il existe.
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
  const { file, fileName, dirty, markSaved } = useAppStore.getState();
  if (!dirty) return;

  let json: string;
  try {
    json = serializeTeamFile(file);
  } catch {
    return; // état transitoirement invalide : on retentera au prochain tick
  }

  if (hasLinkedFile()) {
    try {
      await writeLinkedFile(file);
      markSaved();
      await writeBackup({ json, savedAt: new Date().toISOString(), fileName, dirty: false });
      return;
    } catch {
      // l'écriture directe a échoué : le backup ci-dessous reste le filet
    }
  }
  await writeBackup({ json, savedAt: new Date().toISOString(), fileName, dirty: true });
}
