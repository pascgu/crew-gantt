import { useEffect } from 'react';
import { clearHistory, useAppStore } from '@/state/store';
import { parseTeamFile } from '@/core/model/migrate';
import { clearBackup, readBackup } from '@/io/backup';
import { useNotifications } from '@/state/notifications';
import { t } from '@/i18n/fr';

// Garde au niveau module : StrictMode (dev) monte ce composant deux fois et
// réinitialise les refs au remontage. Un flag module, posé synchronement avant
// le `readBackup()` asynchrone, est vu par la seconde invocation et évite le double toast.
let backupChecked = false;

/**
 * Détecte au démarrage une sauvegarde de secours non écrite et pousse
 * une notification sticky (toast + panneau Messages) plutôt qu'un bandeau pleine largeur.
 */
export function BackupPrompt() {
  const push = useNotifications((s) => s.push);
  const dismiss = useNotifications((s) => s.dismiss);

  useEffect(() => {
    if (backupChecked) return;
    backupChecked = true;
    void readBackup().then((record) => {
      if (!record?.dirty) return;
      const when = new Date(record.savedAt).toLocaleString('fr-FR');

      const restore = () => {
        try {
          const file = parseTeamFile(record.json);
          useAppStore.getState().replaceFile(file, record.fileName);
          clearHistory();
          useAppStore.setState({ dirty: true });
        } finally {
          void clearBackup();
        }
      };

      let notifId = 0;
      notifId = push({
        kind: 'warn',
        message: t('backup.title'),
        detail: t('backup.body', { date: when }),
        sticky: true,
        actions: [
          { label: t('backup.restore'), primary: true, onClick: restore },
          {
            label: t('backup.discard'),
            onClick: () => {
              void clearBackup();
              dismiss(notifId);
            },
          },
        ],
      });
    });
  }, [push, dismiss]);

  return null;
}
