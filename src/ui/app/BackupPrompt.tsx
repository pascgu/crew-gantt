import { useEffect, useState } from 'react';
import { clearHistory, useAppStore } from '@/state/store';
import { parseTeamFile } from '@/core/model/migrate';
import { clearBackup, readBackup, type BackupRecord } from '@/io/backup';
import { t } from '@/i18n/fr';

/**
 * Au démarrage : si une sauvegarde de secours contient des modifications
 * jamais écrites dans un fichier, on propose de la restaurer.
 */
export function BackupPrompt() {
  const [backup, setBackup] = useState<BackupRecord | null>(null);

  useEffect(() => {
    void readBackup().then((record) => {
      if (record?.dirty) setBackup(record);
    });
  }, []);

  if (!backup) return null;

  const restore = () => {
    try {
      const file = parseTeamFile(backup.json);
      useAppStore.getState().replaceFile(file, backup.fileName);
      clearHistory();
      useAppStore.setState({ dirty: true });
    } finally {
      setBackup(null);
    }
  };

  const discard = () => {
    void clearBackup();
    setBackup(null);
  };

  const when = new Date(backup.savedAt).toLocaleString('fr-FR');

  return (
    <div className="flex items-center gap-4 border-b border-warn/30 bg-warn-wash px-4 py-2.5 text-sm text-ink">
      <span className="font-medium">{t('backup.title')}</span>
      <span className="text-ink-soft">{t('backup.body', { date: when })}</span>
      <span className="ml-auto flex shrink-0 gap-2">
        <button
          className="rounded-md bg-warn px-3 py-1 text-[13px] font-medium text-white transition hover:brightness-95"
          onClick={restore}
        >
          {t('backup.restore')}
        </button>
        <button
          className="rounded-md border border-line bg-surface px-3 py-1 text-[13px] font-medium text-ink-soft transition hover:text-ink"
          onClick={discard}
        >
          {t('backup.discard')}
        </button>
      </span>
    </div>
  );
}
