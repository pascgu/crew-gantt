import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/bricolage-grotesque/index.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles/index.css';
import { App } from './ui/app/App';
import { ErrorBoundary } from './ui/app/ErrorBoundary';
import { startAutosave } from './io/autosave';
import { getRecentFiles, removeRecentFile, supportsRecentFiles } from './io/handleStore';
import { openNativePath, restoreHandle, setPendingHandle } from './io/fileAccess';
import { isTauriRuntime } from './io/tauri';
import { clearBackup } from './io/backup';
import { clearHistory, useAppStore } from './state/store';
import { t } from './i18n/fr';

startAutosave();

/** Fichier passé en argument au lancement (association .cgan / double-clic), à consommer une fois. */
async function takeStartupFile(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string | null>('take_startup_file');
}

/** Restauration silencieuse du dernier fichier ouvert (Chrome/Edge, ou app native Tauri). */
async function restoreMostRecent(): Promise<void> {
  if (!supportsRecentFiles) return;
  try {
    const recents = await getRecentFiles();
    const most = recents[0];
    if (!most) return;
    const result = await restoreHandle(most);
    if (result.status === 'ok') {
      useAppStore.getState().replaceFile(result.opened.file, result.opened.name);
    } else if (result.status === 'prompt') {
      setPendingHandle(most);
      useAppStore.getState().setPendingRestoreName(most.name);
    } else {
      // Fichier introuvable : purger de la liste
      void removeRecentFile(most.name);
    }
  } catch {
    /* IDB indisponible : démo par défaut */
  }
}

// Priorité : fichier passé au lancement (association .cgan) > dernier fichier ouvert.
void takeStartupFile().then(async (startupPath) => {
  if (startupPath) {
    const opened = await openNativePath(startupPath);
    if (opened) {
      useAppStore.getState().replaceFile(opened.file, opened.name);
      return;
    }
  }
  await restoreMostRecent();
});

// Deuxième instance lancée depuis l'explorateur pendant que l'app tourne déjà :
// le fichier est transmis à la fenêtre existante au lieu d'ouvrir une nouvelle instance.
if (isTauriRuntime()) {
  void (async () => {
    const { listen } = await import('@tauri-apps/api/event');
    await listen<string>('open-file', async (event) => {
      const { dirty } = useAppStore.getState();
      if (dirty && !window.confirm(t('file.confirmDiscard'))) return;
      const opened = await openNativePath(event.payload);
      if (!opened) {
        window.alert(t('file.openError'));
        return;
      }
      useAppStore.getState().replaceFile(opened.file, opened.name);
      clearHistory();
      void clearBackup();
    });
  })();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
