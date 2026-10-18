/**
 * App bureau uniquement (lancé par `npm run e2e:tauri`) — T6 « un programme par fichier » et
 * ouverture par association (exe lancé avec un chemin .cgan, comme un double-clic dans l'Explorateur).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { createDemoTeamFile } from '../../../src/core/model/demo';

const CDP = process.env.CREW_TAURI_CDP;
const EXE = process.env.CREW_TAURI_EXE ?? '';

test.skip(!CDP, 'app bureau seulement (npm run e2e:tauri)');

const launched: ChildProcess[] = [];
let browser: Browser;

test.afterAll(() => {
  for (const p of launched) p.kill();
});

function writeTeam(dir: string, name: string): string {
  const file = createDemoTeamFile('2026-10-21');
  file.team.name = name;
  const p = path.join(dir, `${name}.cgan`);
  fs.writeFileSync(p, JSON.stringify(file, null, 2));
  return p;
}

/** Lance une nouvelle instance sur un fichier et renvoie sa fenêtre (nouvelle page CDP). */
async function launch(filePath: string): Promise<Page> {
  const before = new Set(browser.contexts().flatMap((c) => c.pages()));
  launched.push(spawn(EXE, [filePath], { env: process.env, detached: false }));
  await expect
    .poll(() => browser.contexts().flatMap((c) => c.pages()).filter((p) => !before.has(p)).length, { timeout: 60_000 })
    .toBeGreaterThan(0);
  const page = browser.contexts().flatMap((c) => c.pages()).find((p) => !before.has(p))!;
  await page.waitForFunction(() => !!window.__crew?.ui().fileName, null, { timeout: 30_000 });
  return page;
}

test('T6 — deux fichiers = deux programmes, chacun son fichier et son secours ; doublon signalé', async () => {
  test.setTimeout(240_000);
  browser = await chromium.connectOverCDP(CDP!);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewgantt-t6-'));
  const a = writeTeam(dir, 'equipe-a');
  const b = writeTeam(dir, 'equipe-b');

  // ouverture par association : l'exe reçoit le chemin en argument
  const pageA = await launch(a);
  const pageB = await launch(b);
  expect(await pageA.evaluate(() => window.__crew!.ui().fileName)).toBe('equipe-a.cgan');
  expect(await pageB.evaluate(() => window.__crew!.ui().fileName)).toBe('equipe-b.cgan');

  // une modification dans chaque fenêtre → deux sauvegardes de secours distinctes (clé par fichier)
  for (const [page, name] of [[pageA, 'Équipe A modifiée'], [pageB, 'Équipe B modifiée']] as const) {
    await page.locator('header input').first().fill(name);
  }
  await pageA.waitForTimeout(3000); // autosave ~2 s
  const keys = await pageA.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const req = indexedDB.open('crewgantt');
        req.onsuccess = () => {
          const all = req.result.transaction('backup').objectStore('backup').getAllKeys();
          all.onsuccess = () => resolve(all.result as string[]);
        };
      }),
  );
  expect(keys).toEqual(expect.arrayContaining([`native:${a.toLowerCase()}`, `native:${b.toLowerCase()}`]));

  // même fichier rouvert ailleurs → avertissement (décision : ouvrir quand même + avertir)
  const pageA2 = await launch(a);
  await expect(pageA2.getByText(/déjà ouvert dans une autre fenêtre/)).toBeVisible({ timeout: 10_000 });
});
