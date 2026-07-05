/**
 * Aide à la construction d'icônes retouchées à la main, pixel par pixel — pour les tailles où un
 * simple resize du SVG devient flou (typiquement 16×16, parfois 32×32). Voir
 * references/pixel-art-techniques.md pour la méthode complète.
 *
 * Usage typique (dans un script jetable qui importe ce module) :
 *
 *   import { createGrid, fillRect, softenCorners, setPixel, writePixelPNG, mix } from '<skill-dir>/scripts/pixel-icon.mjs';
 *
 *   const BG = [0xf7, 0xe9, 0xc1];
 *   const grid = createGrid(16, 16, BG);
 *   fillRect(grid, 2, 3, 10, 4, [0x4f, 0x8e, 0xf7]);
 *   softenCorners(grid, 2, 3, 10, 4, [0x4f, 0x8e, 0xf7], BG);
 *   setPixel(grid, 3, 4, [0x21, 0x1f, 0x1a]); // poignée
 *   await writePixelPNG(grid, 'icon-16-dedie.png');
 */
import sharp from 'sharp';

/** Mélange colorA/colorB. t = proportion de colorA (0..1). Retourne [r,g,b]. */
export function mix(colorA, colorB, t) {
  return [0, 1, 2].map((i) => Math.round(colorA[i] * t + colorB[i] * (1 - t)));
}

/** Grille de pixels width×height, tous initialisés à `bg` ([r,g,b]). */
export function createGrid(width, height, bg) {
  return {
    width,
    height,
    pixels: Array.from({ length: height }, () => Array.from({ length: width }, () => bg)),
  };
}

export function setPixel(grid, x, y, color) {
  if (x >= 0 && x < grid.width && y >= 0 && y < grid.height) grid.pixels[y][x] = color;
}

export function fillRect(grid, x, y, w, h, color) {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) setPixel(grid, i, j, color);
  }
}

/**
 * Adoucit les 4 coins d'un rectangle en mélangeant `color` avec `bg` — remplace l'antialiasing
 * vectoriel (inutile ou trop flou à l'échelle pixel). t = proportion de `color` (0.5-0.6 conseillé,
 * "un peu" adouci — pas un vrai flou).
 */
export function softenCorners(grid, x, y, w, h, color, bg, t = 0.55) {
  const blended = mix(color, bg, t);
  setPixel(grid, x, y, blended);
  setPixel(grid, x + w - 1, y, blended);
  setPixel(grid, x, y + h - 1, blended);
  setPixel(grid, x + w - 1, y + h - 1, blended);
}

/**
 * Poignée/marqueur en retrait d'1 pixel du bord réel d'une forme, avec une colonne de transition
 * mélangée vers la couleur adjacente — jamais collée pile sur le bord (voir
 * references/pixel-art-techniques.md). markColor = couleur pleine du marqueur (souvent une encre
 * foncée) ; adjacent = couleur de la forme à cet endroit (pour la colonne de transition).
 */
export function insetMarker(grid, x, y, height, markColor, adjacent, t = 0.5) {
  for (let j = y; j < y + height; j++) {
    setPixel(grid, x, j, markColor);
    setPixel(grid, x + 1, j, mix(markColor, adjacent, t));
  }
}

/** Écrit la grille en PNG (RGB, sans alpha — garder les couleurs plates et prévisibles). */
export async function writePixelPNG(grid, outPath) {
  const { width, height, pixels } = grid;
  const buf = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixels[y][x];
      const i = (y * width + x) * 3;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
    }
  }
  await sharp(buf, { raw: { width, height, channels: 3 } }).png().toFile(outPath);
}

/**
 * Génère un aperçu agrandi en kernel 'nearest' (jamais lanczos/bicubic) pour juger les vrais
 * pixels sans flou de rééchantillonnage — c'est le seul zoom fiable pour valider une retouche.
 */
export async function previewNearest(pngPath, outPath, scale = 16) {
  const meta = await sharp(pngPath).metadata();
  await sharp(pngPath)
    .resize(meta.width * scale, meta.height * scale, { kernel: 'nearest' })
    .png()
    .toFile(outPath);
}
