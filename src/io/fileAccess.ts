import { parseTeamFile, serializeTeamFile } from '@/core/model/migrate';
import type { TeamFile } from '@/core/model/types';
import { pushRecentFile, supportsHandlePersistence } from './handleStore';

const FILE_TYPES = [
  {
    description: 'Fichier CrewGantt',
    accept: { 'application/json': ['.cgan'] as string[] },
  },
];

/** Poignée du fichier lié (non sérialisable — vit hors du store). */
let currentHandle: FileSystemFileHandle | null = null;

/** Handle en attente de permission utilisateur (geste requis). Vit hors du store. */
let pendingHandle: FileSystemFileHandle | null = null;

export function getPendingHandle(): FileSystemFileHandle | null {
  return pendingHandle;
}

export function setPendingHandle(h: FileSystemFileHandle | null): void {
  pendingHandle = h;
}

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
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null; // annulation utilisateur
    throw e;
  }
  const handle = handles[0];
  if (!handle) return null;
  const blob = await handle.getFile();
  const file = parseTeamFile(await blob.text());
  currentHandle = handle;
  void pushRecentFile(handle);
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
    input.accept = '.cgan,application/json';
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
  return `${slug}.cgan`;
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
        void pushRecentFile(currentHandle);
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

export type RestoreResult =
  | { status: 'ok'; opened: OpenedFile }
  | { status: 'prompt' }
  | { status: 'error' };

/**
 * Tente de restaurer un handle stocké en IDB sans geste utilisateur.
 * - 'ok'     : permission déjà accordée, fichier lu → lié.
 * - 'prompt' : permission à demander (bannière à afficher).
 * - 'error'  : fichier introuvable ou accès refusé définitivement.
 */
export async function restoreHandle(handle: FileSystemFileHandle): Promise<RestoreResult> {
  if (!supportsHandlePersistence) return { status: 'error' };
  try {
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'prompt') return { status: 'prompt' };
    if (perm !== 'granted') return { status: 'error' };
    const blob = await handle.getFile();
    const file = parseTeamFile(await blob.text());
    currentHandle = handle;
    return { status: 'ok', opened: { file, name: blob.name, linked: true } };
  } catch {
    return { status: 'error' };
  }
}

/**
 * Demande explicitement la permission (nécessite un geste utilisateur).
 * Retourne le fichier si accordé, null sinon.
 */
export async function requestAndRestoreHandle(handle: FileSystemFileHandle): Promise<OpenedFile | null> {
  if (!supportsHandlePersistence) return null;
  try {
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') return null;
    const blob = await handle.getFile();
    const file = parseTeamFile(await blob.text());
    currentHandle = handle;
    return { file, name: blob.name, linked: true };
  } catch {
    return null;
  }
}

export { supportsHandlePersistence };

function downloadJson(json: string, name: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
