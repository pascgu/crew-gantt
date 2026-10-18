import { defineConfig } from '@playwright/test';

/**
 * Projet « tauri » (C2) : actif seulement quand `npm run e2e:tauri` a lancé l'app bureau avec un port
 * de débogage WebView2 (CREW_TAURI_CDP). Une seule fenêtre → un seul worker, pas de parallélisme.
 */
const tauri = process.env.CREW_TAURI_CDP;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: 0,
  workers: tauri ? 1 : undefined,
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1680, height: 950 },
    locale: 'fr-FR',
  },
  projects: tauri
    ? [{ name: 'tauri', testMatch: ['scenarios/**/*.spec.ts', 'tauri/**/*.spec.ts'], use: { browserName: 'chromium' } }]
    : [{ name: 'chromium', testIgnore: ['tauri/**'], use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
