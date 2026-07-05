/**
 * Génère toutes les icônes dans public/ depuis les sources versionnées :
 *   public/icon-source.svg            → grandes icônes (192, 512, maskable, apple-touch, favicon 32)
 *   public/favicon-16x16-source.png   → bitmap 16×16 retouché à la main (pas de rasterisation SVG à
 *                                        cette taille : trop de flou d'antialiasing pour rester net)
 *
 * Usage : node scripts/gen-icons.mjs
 */
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const pub = join(root, 'public');

const iconSrc = readFileSync(join(pub, 'icon-source.svg'));

async function gen(src, size, outFile) {
  await sharp(src).resize(size, size).png().toFile(join(pub, outFile));
  console.log(`  ✓ ${outFile}`);
}

console.log('Génération des icônes...');

// Grandes icônes (manifest PWA)
await gen(iconSrc, 64,  'pwa-64x64.png');
await gen(iconSrc, 192, 'pwa-192x192.png');
await gen(iconSrc, 512, 'pwa-512x512.png');

// Apple touch icon
await gen(iconSrc, 180, 'apple-touch-icon-180x180.png');

// Maskable icon : contenu à 80 % du canvas, fond jaune pâle (couleur du squircle du design)
const safeSize = Math.round(512 * 0.8);   // 410 px
const padding  = Math.round((512 - safeSize) / 2); // 51 px
await sharp(iconSrc)
  .resize(safeSize, safeSize)
  .extend({ top: padding, bottom: padding, left: padding, right: padding,
            background: { r: 0xf7, g: 0xe9, b: 0xc1, alpha: 1 } })
  .png()
  .toFile(join(pub, 'maskable-icon-512x512.png'));
console.log('  ✓ maskable-icon-512x512.png');

// Favicon 32×32 : rasterisé depuis le SVG maître (déjà net à cette taille)
await gen(iconSrc, 32, 'favicon-32x32.png');

// Favicon 16×16 : copie directe du bitmap retouché à la main (pas de resize du SVG)
copyFileSync(join(pub, 'favicon-16x16-source.png'), join(pub, 'favicon-16x16.png'));
console.log('  ✓ favicon-16x16.png');

// favicon.ico : conteneur multi-résolution 16/32/48, assemblé depuis les PNG ci-dessus
// (16 = bitmap retouché, 32 = déjà généré, 48 = rasterisé à la volée)
const favicon48 = await sharp(iconSrc).resize(48, 48).png().toBuffer();
const icoBuffer = await pngToIco([
  join(pub, 'favicon-16x16.png'),
  join(pub, 'favicon-32x32.png'),
  favicon48,
]);
writeFileSync(join(pub, 'favicon.ico'), icoBuffer);
console.log('  ✓ favicon.ico');

console.log('Terminé.');
