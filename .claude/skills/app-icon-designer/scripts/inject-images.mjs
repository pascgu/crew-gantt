#!/usr/bin/env node
/**
 * Remplace des tokens {{TOKEN}} dans un template HTML par le contenu base64 des fichiers
 * correspondants — sert à construire une page de comparaison auto-suffisante (images embarquées,
 * un seul fichier local à ouvrir, rien à héberger).
 *
 * Usage :
 *   node inject-images.mjs <template.html> <output.html> TOKEN1=fichier1.png TOKEN2=fichier2.png ...
 *
 * Dans le template, les tokens s'utilisent entourés d'accolades doubles, typiquement dans un
 * attribut src : <img src="data:image/png;base64,{{TOKEN1}}">
 * Les accolades évitent les bugs de préfixe (ex. {{SIZE_16}} vs {{SIZE_16_DEDICATED}} ne se
 * télescopent pas, contrairement à des tokens nus comme IMG16/IMG16DEDIE).
 */
import { readFileSync, writeFileSync } from 'fs';

const argv = process.argv.slice(2);
const [template, output, ...pairs] = argv;
if (!template || !output || pairs.length === 0) {
  console.error('Usage: node inject-images.mjs <template.html> <output.html> TOKEN=file.png [TOKEN2=file2.png ...]');
  process.exit(1);
}

let html = readFileSync(template, 'utf8');
for (const pair of pairs) {
  const eq = pair.indexOf('=');
  if (eq === -1) throw new Error(`Argument invalide (attendu TOKEN=fichier) : ${pair}`);
  const token = pair.slice(0, eq);
  const file = pair.slice(eq + 1);
  const b64 = readFileSync(file).toString('base64');
  html = html.split(`{{${token}}}`).join(b64);
}
writeFileSync(output, html);
console.log(`ok, écrit ${output}`);
