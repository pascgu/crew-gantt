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
import { getRecentFiles, removeRecentFile } from './io/handleStore';
import { restoreHandle, setPendingHandle, supportsHandlePersistence } from './io/fileAccess';
import { useAppStore } from './state/store';

startAutosave();

// Restauration silencieuse du dernier fichier ouvert (Chrome/Edge uniquement)
if (supportsHandlePersistence) {
  getRecentFiles()
    .then(async (recents) => {
      const most = recents[0];
      if (!most) return;
      const result = await restoreHandle(most.handle);
      if (result.status === 'ok') {
        useAppStore.getState().replaceFile(result.opened.file, result.opened.name);
      } else if (result.status === 'prompt') {
        setPendingHandle(most.handle);
        useAppStore.getState().setPendingRestoreName(most.name);
      } else {
        // Fichier introuvable : purger de la liste
        void removeRecentFile(most.name);
      }
    })
    .catch(() => {
      /* IDB indisponible : démo par défaut */
    });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
