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
  requestAndRestoreHandle,
  saveTeamFile,
  supportsFileSystemAccess,
  unlinkFile,
} from '@/io/fileAccess';
import type { SaveOutcome } from '@/io/fileAccess';
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
    try {
      // Ouvrir le sélecteur en premier (requiert le geste utilisateur immédiat).
      // Confirmer l'abandon des modifs APRÈS avoir un fichier en main.
      let opened: OpenedFile | null = null;
      if (supportsFileSystemAccess()) {
        opened = await openWithPicker();
      } else {
        const blob = await pickFileFallback();
        if (blob) opened = await openFromBlob(blob);
      }
      if (!opened) return;
      if (!confirmDiscardIfDirty()) return;
      applyOpened(opened);
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
    // « Enregistrer sous » : repartir du nom courant de l'équipe (pas du nom de fichier figé).
    const suggested = options.saveAs
      ? defaultFileName(file.team.name)
      : (fileName ?? defaultFileName(file.team.name));
    let name = suggested;
    // Navigateur sans File System Access : pas de sélecteur natif → demander le nom soi-même.
    if (options.saveAs && !supportsFileSystemAccess()) {
      const chosen = window.prompt(t('file.saveAsPrompt'), suggested);
      if (chosen === null) return;
      name = chosen.trim() || suggested;
    }
    const outcome: SaveOutcome = await saveTeamFile(file, name, options);
    if (outcome.mode === 'cancelled') return;
    setFileName(outcome.name);
    markSaved();
    void clearBackup();
  }, []);

  const openRecent = useCallback(async (handle: FileSystemFileHandle) => {
    if (!confirmDiscardIfDirty()) return;
    const opened = await requestAndRestoreHandle(handle);
    if (!opened) {
      window.alert(t('file.openError'));
      return;
    }
    applyOpened(opened);
  }, []);

  return { newFile, openFile, openDropped, save, openRecent };
}
