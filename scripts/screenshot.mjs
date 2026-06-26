// Capture rapide de l'app pour vérification visuelle pendant le développement.
// Usage : node scripts/screenshot.mjs [fichier-sortie] [onglet]
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'screenshot.png';
const tab = process.argv[3] ?? null;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1720, height: 980 } });
page.on('console', (msg) => {
  if (msg.type() === 'error') console.error('[console]', msg.text());
});
page.on('pageerror', (err) => console.error('[pageerror]', err.message));
await page.goto('http://localhost:5173');
await page.waitForTimeout(1200);
if (tab) {
  await page.getByRole('button', { name: tab, exact: true }).click();
  await page.waitForTimeout(600);
}
await page.screenshot({ path: out });
await browser.close();
console.log(`OK → ${out}`);
