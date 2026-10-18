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
import { checkStartupBackups } from './ui/app/BackupPrompt';
import { startAutosave } from './io/autosave';
import { getRecentFiles, removeRecentFile, supportsRecentFiles } from './io/handleStore';
import { currentBackupKey, openNativePath, restoreHandle, setPendingHandle } from './io/fileAccess';
import { isOpenElsewhere, setOpenDocument } from './io/instances';
import { UNTITLED_PREFIX } from './io/backup';
import { isTauriRuntime } from './io/tauri';
import { useAppStore } from './state/store';
import { useNotifications } from './state/notifications';
import { t } from './i18n/fr';

startAutosave();

// Service worker (hors-ligne de la version navigateur / Docker) : jamais dans l'app bureau, où il
// figeait une ancienne version en cache (Tauri ne le met pas à jour). S'il en reste un d'une version
// antérieure, on le désinscrit et on vide son cache (main.rs le purge aussi à chaque mise à jour).
if (!import.meta.env.DEV) {
  if (isTauriRuntime()) {
    void navigator.serviceWorker?.getRegistrations().then((regs) => regs.forEach((r) => void r.unregister()));
    void globalThis.caches?.keys().then((keys) => keys.forEach((k) => void caches.delete(k)));
  } else {
    void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
  }
}

// Hook de test (window.__crew) pour les scénarios Playwright — jamais embarqué en prod.
if (import.meta.env.DEV) void import('./devHook');

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

/**
 * Un programme par fichier (T6) : chaque fenêtre déclare son document aux autres ; à l'ouverture
 * d'un fichier déjà ouvert dans une autre fenêtre, on prévient (les deux écriraient le même fichier).
 */
function trackOpenDocument(): void {
  const announce = (warn: boolean) => {
    const { fileName } = useAppStore.getState();
    const key = currentBackupKey(fileName);
    const shareable = !key.startsWith(UNTITLED_PREFIX);
    setOpenDocument(shareable ? key : null);
    if (!warn || !shareable) return;
    void isOpenElsewhere(key).then((elsewhere) => {
      if (!elsewhere) return;
      useNotifications.getState().push({
        kind: 'warn',
        message: t('file.alreadyOpen', { name: fileName ?? '' }),
        sticky: true,
      });
    });
  };
  announce(true);
  useAppStore.subscribe((s, prev) => {
    // nouveau document ouvert (replaceFile) ou renommé (Enregistrer sous)
    if (s.fileAtLoad !== prev.fileAtLoad || s.fileName !== prev.fileName) announce(s.fileAtLoad !== prev.fileAtLoad);
  });
}

// Priorité : fichier passé au lancement (association .cgan) > dernier fichier ouvert. Ensuite
// seulement, on cherche une sauvegarde de secours — celle de CE fichier (une par fichier).
void takeStartupFile().then(async (startupPath) => {
  let launchedOnFile = false;
  if (startupPath) {
    const opened = await openNativePath(startupPath);
    if (opened) {
      useAppStore.getState().replaceFile(opened.file, opened.name);
      launchedOnFile = true;
    }
  }
  if (!launchedOnFile) await restoreMostRecent();
  await checkStartupBackups(launchedOnFile);
  trackOpenDocument();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
