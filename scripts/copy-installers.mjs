/**
 * Après `tauri build` : copie l'installeur de la version courante (package.json) dans `installers/`
 * à la racine du dépôt (ignoré par git), pour le joindre ensuite à une release GitHub.
 * Les installeurs des versions précédentes déjà copiés sont conservés.
 */
import fs from 'node:fs';
import path from 'node:path';

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const bundleDir = path.join('src-tauri', 'target', 'release', 'bundle', 'nsis');
const outDir = 'installers';
const name = `CrewGantt_${version}_x64-setup.exe`;
const source = path.join(bundleDir, name);

if (!fs.existsSync(source)) {
  console.error(`[installers] introuvable : ${source}`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(source, path.join(outDir, name));
console.log(`[installers] ${name} → ${path.resolve(outDir, name)}`);
