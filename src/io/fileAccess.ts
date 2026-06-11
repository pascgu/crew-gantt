import { parseTeamFile, serializeTeamFile } from '@/core/model/migrate';
import type { TeamFile } from '@/core/model/types';

const FILE_TYPES = [
  {
    description: 'Fichier CrewGantt',
    accept: { 'application/json': ['.json'] as string[] },
  },
];

/** Poignée du fichier lié (non sérialisable — vit hors du store). */
let currentHandle: FileSystemFileHandle | null = null;

export function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
}

export function hasLinkedFile(): boolean {
  return currentHandle !== null;
}

export function unlinkFile(): void {
  currentHandle = null;
}

export interface OpenedFile {
  file: TeamFile;
  name: string;
  /** true si le fichier est lié (réécriture directe possible). */
  linked: boolean;
}

/** Ouverture via la boîte de dialogue native (File System Access). */
export async function openWithPicker(): Promise<OpenedFile | null> {
  if (!window.showOpenFilePicker) return null;
  let handles: FileSystemFileHandle[];
  try {
    handles = await window.showOpenFilePicker({ types: FILE_TYPES, multiple: false });
  } catch {
    return null; // annulation utilisateur
  }
  const handle = handles[0];
  if (!handle) return null;
  const blob = await handle.getFile();
  const file = parseTeamFile(await blob.text());
  currentHandle = handle;
  return { file, name: blob.name, linked: true };
}

/** Ouverture depuis un File (input ou glisser-déposer) — mode fallback, non lié. */
export async function openFromBlob(blob: File): Promise<OpenedFile> {
  const file = parseTeamFile(await blob.text());
  currentHandle = null;
  return { file, name: blob.name, linked: false };
}

/** Sélecteur de fichier fallback (`<input type="file">`). */
export function pickFileFallback(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    // Pas d'événement fiable d'annulation : resolve(null) au retour du focus.
    window.addEventListener(
      'focus',
      () => setTimeout(() => resolve(input.files?.[0] ?? null), 300),
      { once: true },
    );
    input.click();
  });
}

export function defaultFileName(teamName: string): string {
  const slug =
    teamName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'equipe';
  return `${slug}.crewgantt.json`;
}

export type SaveOutcome =
  | { mode: 'linked'; name: string }
  | { mode: 'download'; name: string }
  | { mode: 'cancelled' };

/**
 * Enregistre le fichier : réécriture directe si lié, sinon boîte « enregistrer
 * sous » (FS Access), sinon téléchargement.
 */
export async function saveTeamFile(
  file: TeamFile,
  suggestedName: string,
  options: { saveAs?: boolean } = {},
): Promise<SaveOutcome> {
  const json = serializeTeamFile(file);

  if (supportsFileSystemAccess()) {
    if (!currentHandle || options.saveAs) {
      try {
        currentHandle = await window.showSaveFilePicker!({
          suggestedName,
          types: FILE_TYPES,
        });
      } catch {
        return { mode: 'cancelled' };
      }
    }
    const writable = await currentHandle.createWritable();
    await writable.write(json);
    await writable.close();
    return { mode: 'linked', name: currentHandle.name };
  }

  downloadJson(json, suggestedName);
  return { mode: 'download', name: suggestedName };
}

/** Réécrit silencieusement le fichier lié (auto-save). Sans fichier lié : ne fait rien. */
export async function writeLinkedFile(file: TeamFile): Promise<boolean> {
  if (!currentHandle) return false;
  const json = serializeTeamFile(file);
  const writable = await currentHandle.createWritable();
  await writable.write(json);
  await writable.close();
  return true;
}

function downloadJson(json: string, name: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
