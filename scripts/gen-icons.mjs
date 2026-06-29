/**
 * Génère toutes les icônes PWA dans public/ depuis deux sources SVG :
 *   public/icon-source.svg     → grandes icônes (192, 512, maskable, apple-touch)
 *   public/favicon-source.svg  → petit favicon (svg + 32×32 png)
 *
 * Usage : node scripts/gen-icons.mjs
 */
import sharp from 'sharp';
import { readFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const pub = join(root, 'public');

const iconSrc = readFileSync(join(pub, 'icon-source.svg'));
const faviconSrc = readFileSync(join(pub, 'favicon-source.svg'));

async function gen(src, size, outFile) {
  await sharp(src).resize(size, size).png().toFile(join(pub, outFile));
  console.log(`  ✓ ${outFile}`);
}

console.log('Génération des icônes PWA...');

// Grandes icônes (manifest PWA)
await gen(iconSrc, 64,  'pwa-64x64.png');
await gen(iconSrc, 192, 'pwa-192x192.png');
await gen(iconSrc, 512, 'pwa-512x512.png');

// Apple touch icon
await gen(iconSrc, 180, 'apple-touch-icon-180x180.png');

// Maskable icon : contenu à 80 % du canvas, fond #4f8ef7
const safeSize = Math.round(512 * 0.8);   // 410 px
const padding  = Math.round((512 - safeSize) / 2); // 51 px
await sharp(iconSrc)
  .resize(safeSize, safeSize)
  .extend({ top: padding, bottom: padding, left: padding, right: padding,
            background: { r: 79, g: 142, b: 247, alpha: 1 } })
  .png()
  .toFile(join(pub, 'maskable-icon-512x512.png'));
console.log('  ✓ maskable-icon-512x512.png');

// favicon.svg : copie directe du monogramme « G »
copyFileSync(join(pub, 'favicon-source.svg'), join(pub, 'favicon.svg'));
console.log('  ✓ favicon.svg');

// favicon 32×32 PNG (fallback navigateurs sans support SVG)
await gen(faviconSrc, 32, 'favicon-32x32.png');

console.log('Terminé.');
