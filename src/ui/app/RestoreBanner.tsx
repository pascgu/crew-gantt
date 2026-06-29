import { useAppStore } from '@/state/store';
import { getPendingHandle, requestAndRestoreHandle, setPendingHandle } from '@/io/fileAccess';
import { t } from '@/i18n/fr';
import { IconClose } from '@/ui/common/icons';

let restoreInProgress = false;

export function RestoreBanner() {
  const pendingRestoreName = useAppStore((s) => s.pendingRestoreName);
  const setPendingRestoreName = useAppStore((s) => s.setPendingRestoreName);
  const replaceFile = useAppStore((s) => s.replaceFile);

  if (!pendingRestoreName) return null;

  const dismiss = () => {
    setPendingHandle(null);
    setPendingRestoreName(null);
  };

  const handleOpen = async () => {
    if (restoreInProgress) return;
    restoreInProgress = true;
    try {
      const handle = getPendingHandle();
      if (!handle) { dismiss(); return; }
      const opened = await requestAndRestoreHandle(handle);
      if (opened) {
        replaceFile(opened.file, opened.name);
        setPendingHandle(null);
        setPendingRestoreName(null);
      }
      // Si refusé : on garde la bannière (l'utilisateur peut réessayer)
    } finally {
      restoreInProgress = false;
    }
  };

  return (
    <div className="flex items-center gap-3 border-b border-line bg-surface-raised px-4 py-1.5 text-[12px]">
      <span className="flex-1 text-ink">
        {t('file.reopen', { name: pendingRestoreName })}
      </span>
      <button
        className="rounded px-2.5 py-1 font-medium text-accent transition hover:bg-accent/10"
        onClick={() => void handleOpen()}
      >
        {t('file.reopenConfirm')}
      </button>
      <button
        className="text-ink-faint transition hover:text-ink"
        title={t('common.dismiss')}
        onClick={dismiss}
      >
        <IconClose size={13} />
      </button>
    </div>
  );
}
