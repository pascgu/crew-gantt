import { useCallback } from 'react';
import { clearHistory, useAppStore } from '@/state/store';
import { createEmptyTeamFile } from '@/core/model/factory';
import { TeamFileError } from '@/core/model/migrate';
import { t } from '@/i18n/fr';
import {
  defaultFileName,
  openFromBlob,
  openWithPicker,
  pickFileFallback,
  saveTeamFile,
  supportsFileSystemAccess,
  unlinkFile,
} from '@/io/fileAccess';
import { clearBackup } from '@/io/backup';
import type { OpenedFile } from '@/io/fileAccess';

function confirmDiscardIfDirty(): boolean {
  const { dirty } = useAppStore.getState();
  return !dirty || window.confirm(t('file.confirmDiscard'));
}

function applyOpened(opened: OpenedFile): void {
  const { replaceFile } = useAppStore.getState();
  replaceFile(opened.file, opened.name);
  clearHistory();
  void clearBackup();
}

/** Actions fichier partagées (barre du haut, raccourcis clavier, drag-drop). */
export function useFileActions() {
  const newFile = useCallback(() => {
    if (!confirmDiscardIfDirty()) return;
    unlinkFile();
    const { replaceFile } = useAppStore.getState();
    replaceFile(createEmptyTeamFile('Nouvelle équipe'), null);
    clearHistory();
  }, []);

  const openFile = useCallback(async () => {
    if (!confirmDiscardIfDirty()) return;
    try {
      if (supportsFileSystemAccess()) {
        const opened = await openWithPicker();
        if (opened) applyOpened(opened);
      } else {
        const blob = await pickFileFallback();
        if (blob) applyOpened(await openFromBlob(blob));
      }
    } catch (e) {
      const detail = e instanceof TeamFileError ? [e.message, ...e.issues].join('\n') : String(e);
      window.alert(`${t('file.openError')}\n${detail}`);
    }
  }, []);

  const openDropped = useCallback(async (blob: File) => {
    if (!confirmDiscardIfDirty()) return;
    try {
      applyOpened(await openFromBlob(blob));
    } catch (e) {
      const detail = e instanceof TeamFileError ? [e.message, ...e.issues].join('\n') : String(e);
      window.alert(`${t('file.openError')}\n${detail}`);
    }
  }, []);

  const save = useCallback(async (options: { saveAs?: boolean } = {}) => {
    const { file, fileName, markSaved, setFileName } = useAppStore.getState();
    const suggested = fileName ?? defaultFileName(file.team.name);
    const outcome = await saveTeamFile(file, suggested, options);
    if (outcome.mode === 'cancelled') return;
    setFileName(outcome.name);
    markSaved();
    void clearBackup();
  }, []);

  return { newFile, openFile, openDropped, save };
}
