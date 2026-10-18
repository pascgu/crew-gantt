import { clearHistory, useAppStore } from '@/state/store';
import { parseTeamFile } from '@/core/model/migrate';
import { clearBackup, LEGACY_KEY, listBackups, readBackup, UNTITLED_PREFIX, type KeyedBackup } from '@/io/backup';
import { currentBackupKey, linkNativePath } from '@/io/fileAccess';
import { useNotifications } from '@/state/notifications';
import { t } from '@/i18n/fr';

/**
 * Sauvegardes de secours (une par fichier depuis la 1.3, cf. io/backup) : proposées par une
 * notification sticky (toast + panneau Messages) — « Restaurer » ou « Ignorer ».
 */

const offered = new Set<string>();

/** Propose la restauration d'une sauvegarde de secours (une seule fois par clé et par session). */
export function offerBackup(backup: KeyedBackup): void {
  if (!backup.dirty || offered.has(backup.key)) return;
  offered.add(backup.key);
  const { push, dismiss } = useNotifications.getState();
  const when = new Date(backup.savedAt).toLocaleString('fr-FR');

  const restore = () => {
    try {
      const file = parseTeamFile(backup.json);
      useAppStore.getState().replaceFile(file, backup.fileName);
      // Sauvegarde d'un fichier du disque (bureau) : relier à nouveau son chemin → Ctrl+S y écrit.
      if (backup.path) linkNativePath(backup.path);
      clearHistory();
      useAppStore.setState({ dirty: true });
    } finally {
      void clearBackup(backup.key);
    }
  };

  let notifId = 0;
  notifId = push({
    kind: 'warn',
    message: t('backup.title'),
    detail: t('backup.body', { date: when }) + (backup.fileName ? ` — ${backup.fileName}` : ''),
    sticky: true,
    actions: [
      { label: t('backup.restore'), primary: true, onClick: restore },
      {
        label: t('backup.discard'),
        onClick: () => {
          void clearBackup(backup.key);
          dismiss(notifId);
        },
      },
    ],
  });
}

/** Le document qu'on vient d'ouvrir a-t-il un secours plus récent ? Si oui, le proposer. */
export async function offerBackupForCurrent(): Promise<void> {
  const key = currentBackupKey(useAppStore.getState().fileName);
  const record = await readBackup(key);
  if (record) offerBackup({ ...record, key });
}

/**
 * Au démarrage, une fois le fichier de départ ouvert : on propose le secours de CE fichier, une
 * éventuelle sauvegarde d'avant la 1.3 (clé unique) et — si l'app n'a pas été lancée sur un fichier
 * précis — les documents jamais enregistrés. Les secours des autres fichiers attendent qu'on les rouvre.
 */
export async function checkStartupBackups(launchedOnFile: boolean): Promise<void> {
  const current = currentBackupKey(useAppStore.getState().fileName);
  for (const backup of await listBackups()) {
    const relevant =
      backup.key === current ||
      backup.key === LEGACY_KEY ||
      (!launchedOnFile && backup.key.startsWith(UNTITLED_PREFIX));
    if (relevant) offerBackup(backup);
  }
}
