#!/usr/bin/env node
/**
 * Rasterise un SVG en PNG à plusieurs tailles.
 *
 * Usage :
 *   node render.mjs <svg-path> --sizes 512,192,64,32,16 [--out <dir>] [--prefix icon]
 *
 * Écrit <out>/<prefix>-<size>.png pour chaque taille. <out> défaut : dossier courant.
 * <prefix> défaut : nom du fichier SVG sans extension.
 */
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join, basename, extname } from 'path';

function parseArgs(argv) {
  const args = { sizes: [], out: '.', prefix: null, svg: null };
  const rest = [...argv];
  args.svg = rest.shift();
  while (rest.length) {
    const flag = rest.shift();
    if (flag === '--sizes') args.sizes = rest.shift().split(',').map(Number);
    else if (flag === '--out') args.out = rest.shift();
    else if (flag === '--prefix') args.prefix = rest.shift();
    else throw new Error(`Argument inconnu : ${flag}`);
  }
  if (!args.svg || args.sizes.length === 0) {
    console.error('Usage: node render.mjs <svg-path> --sizes 512,192,64,32,16 [--out <dir>] [--prefix icon]');
    process.exit(1);
  }
  if (!args.prefix) args.prefix = basename(args.svg, extname(args.svg));
  return args;
}

const { svg, sizes, out, prefix } = parseArgs(process.argv.slice(2));
const src = readFileSync(svg);

for (const size of sizes) {
  const outFile = join(out, `${prefix}-${size}.png`);
  await sharp(src).resize(size, size).png().toFile(outFile);
  console.log(`  ok ${size}px -> ${outFile}`);
}
