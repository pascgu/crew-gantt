/**
 * Recette automatique dans l'app bureau (C2 du plan v1.3) : lance `tauri dev` avec un port de
 * débogage WebView2 et un profil jetable, attend que la fenêtre soit pilotable via CDP, puis lance
 * Playwright en mode « tauri » (cf. playwright.config.ts et tests/e2e/scenarios/fixtures.ts).
 *
 *   npm run e2e:tauri                       → scénarios 01-08 + tests/e2e/tauri/ dans WebView2
 *   npm run e2e:tauri -- tests/e2e/tauri    → seulement les tests propres au bureau (T6…)
 *
 * Limite (cf. plan, C2) : le glisser-déposer simulé par Playwright reste interne au moteur web — il
 * ne prouve pas que Windows/Tauri laisse passer un vrai glisser-déposer (recette manuelle M3/M4).
 */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 9222;
const CDP = `http://127.0.0.1:${PORT}`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'crewgantt-e2e-'));
const env = {
  ...process.env,
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
  // profil WebView2 jetable : ne touche ni aux fichiers récents ni aux secours de l'app installée
  WEBVIEW2_USER_DATA_FOLDER: profile,
};

// Fenêtre à la taille de viewport des scénarios (1680×950, coordonnées absolues) : surcharge de config
// passée à `tauri dev` (émuler le viewport via CDP décale les clics dans WebView2).
const conf = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const e2eConf = path.join(profile, 'tauri.e2e.conf.json');
fs.writeFileSync(
  e2eConf,
  JSON.stringify({ app: { windows: [{ ...conf.app.windows[0], width: 1680, height: 950, center: true }] } }),
);

console.log(`[e2e:tauri] profil WebView2 : ${profile}`);
const app = spawn('npx', ['tauri', 'dev', '--config', `"${e2eConf}"`], { env, shell: true, stdio: 'inherit' });

function killTree(pid) {
  try {
    execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
  } catch {
    /* déjà terminé */
  }
}

async function waitForWindow(timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const pages = await (await fetch(`${CDP}/json/list`)).json();
      if (pages.some((p) => p.type === 'page' && p.url.startsWith('http://localhost:5173'))) return;
    } catch {
      /* pas encore prêt (compilation Rust au premier lancement) */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('La fenêtre CrewGantt n’est pas apparue sur le port de débogage');
}

let code = 1;
try {
  await waitForWindow(15 * 60_000);
  console.log('[e2e:tauri] fenêtre prête, lancement de Playwright');
  const args = process.argv.slice(2);
  const pw = spawn('npx', ['playwright', 'test', ...args], {
    env: {
      ...env,
      CREW_TAURI_CDP: CDP,
      CREW_TAURI_EXE: path.resolve('src-tauri/target/debug/crew-gantt.exe'),
    },
    shell: true,
    stdio: 'inherit',
  });
  code = await new Promise((resolve) => pw.on('exit', (c) => resolve(c ?? 1)));
} catch (e) {
  console.error(`[e2e:tauri] ${e instanceof Error ? e.message : e}`);
} finally {
  killTree(app.pid);
  // fenêtres lancées par les tests (T6) : même exécutable
  try {
    execSync('taskkill /IM crew-gantt.exe /F', { stdio: 'ignore' });
  } catch {
    /* aucune */
  }
  fs.rmSync(profile, { recursive: true, force: true });
}
process.exit(code);
