#!/usr/bin/env node
/**
 * Assemble un .ico Windows multi-résolution depuis une liste de PNG (un par taille).
 *
 * Usage :
 *   node build-ico.mjs --out favicon.ico frame-16.png frame-32.png frame-48.png
 *
 * L'ordre des PNG n'a pas d'importance. Chaque PNG doit être carré. Pour une icône d'app Windows
 * native (src-tauri/icons/icon.ico), Microsoft recommande le jeu 16/24/32/48/256 — au-delà de
 * 256×256, le format le permet techniquement mais ce n'est pas recommandé (voir
 * references/size-presets.md). Pour un favicon web, 16/32/48 suffit largement — les navigateurs ne
 * vont jamais chercher de frame plus grande dans un .ico.
 */
import pngToIco from 'png-to-ico';
import { writeFileSync } from 'fs';

const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
if (outIdx === -1 || !argv[outIdx + 1]) {
  console.error('Usage: node build-ico.mjs --out <path.ico> <png1> <png2> ...');
  process.exit(1);
}
const out = argv[outIdx + 1];
const pngs = argv.filter((_, i) => i !== outIdx && i !== outIdx + 1);
if (pngs.length === 0) {
  console.error('Aucun PNG fourni.');
  process.exit(1);
}

const ico = await pngToIco(pngs);
writeFileSync(out, ico);
console.log(`ok, écrit ${out} (${pngs.length} frame(s))`);
