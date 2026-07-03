import { parseTeamFile, serializeTeamFile } from '@/core/model/migrate';
import type { TeamFile } from '@/core/model/types';
import { pushRecentFile, supportsHandlePersistence } from './handleStore';
import type { RecentFile } from './handleStore';
import { isTauriRuntime } from './tauri';

const FILE_TYPES = [
  {
    description: 'Fichier CrewGantt',
    accept: { 'application/json': ['.cgan'] as string[] },
  },
];

type FileRef = { kind: 'web'; handle: FileSystemFileHandle } | { kind: 'native'; path: string };

/** Référence du fichier lié (non sérialisable — vit hors du store). */
let currentHandle: FileRef | null = null;

/** Entrée en attente de permission utilisateur (geste requis). Vit hors du store. */
let pendingHandle: RecentFile | null = null;

export function getPendingHandle(): RecentFile | null {
  return pendingHandle;
}

export function setPendingHandle(h: RecentFile | null): void {
  pendingHandle = h;
}

export function supportsFileSystemAccess(): boolean {
  return isTauriRuntime() || (typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function');
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

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * Ouvre un fichier natif à un chemin déjà connu (association de fichier, double-clic, ré-ouverture
 * depuis une autre instance) : lit directement, sans boîte de dialogue.
 */
export async function openNativePath(path: string): Promise<OpenedFile | null> {
  try {
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const file = parseTeamFile(await readTextFile(path));
    currentHandle = { kind: 'native', path };
    const name = basename(path);
    void pushRecentFile({ kind: 'native', path, name });
    return { file, name, linked: true };
  } catch {
    return null;
  }
}

/** Ouverture via la boîte de dialogue native (Tauri, ou File System Access dans le navigateur). */
export async function openWithPicker(): Promise<OpenedFile | null> {
  if (isTauriRuntime()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({
      multiple: false,
      filters: [{ name: 'Fichier CrewGantt', extensions: ['cgan'] }],
    });
    if (!path || Array.isArray(path)) return null;
    return openNativePath(path);
  }

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
  currentHandle = { kind: 'web', handle };
  void pushRecentFile({ kind: 'web', handle, name: handle.name });
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
 * Enregistre le fichier : réécriture directe si lié (Tauri natif ou FS Access),
 * sinon boîte « enregistrer sous », sinon téléchargement.
 */
export async function saveTeamFile(
  file: TeamFile,
  suggestedName: string,
  options: { saveAs?: boolean } = {},
): Promise<SaveOutcome> {
  const json = serializeTeamFile(file);

  if (isTauriRuntime()) {
    if (!currentHandle || currentHandle.kind !== 'native' || options.saveAs) {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({
        defaultPath: suggestedName,
        filters: [{ name: 'Fichier CrewGantt', extensions: ['cgan'] }],
      });
      if (!path) return { mode: 'cancelled' };
      currentHandle = { kind: 'native', path };
      void pushRecentFile({ kind: 'native', path, name: basename(path) });
    }
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(currentHandle.path, json);
    return { mode: 'linked', name: basename(currentHandle.path) };
  }

  if (supportsFileSystemAccess()) {
    if (!currentHandle || currentHandle.kind !== 'web' || options.saveAs) {
      try {
        const handle = await window.showSaveFilePicker!({
          suggestedName,
          types: FILE_TYPES,
        });
        currentHandle = { kind: 'web', handle };
        void pushRecentFile({ kind: 'web', handle, name: handle.name });
      } catch {
        return { mode: 'cancelled' };
      }
    }
    const handle = (currentHandle as { kind: 'web'; handle: FileSystemFileHandle }).handle;
    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();
    return { mode: 'linked', name: handle.name };
  }

  downloadJson(json, suggestedName);
  return { mode: 'download', name: suggestedName };
}

/** Réécrit silencieusement le fichier lié (auto-save). Sans fichier lié : ne fait rien. */
export async function writeLinkedFile(file: TeamFile): Promise<boolean> {
  if (!currentHandle) return false;
  const json = serializeTeamFile(file);
  if (currentHandle.kind === 'native') {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(currentHandle.path, json);
    return true;
  }
  const writable = await currentHandle.handle.createWritable();
  await writable.write(json);
  await writable.close();
  return true;
}

export type RestoreResult =
  | { status: 'ok'; opened: OpenedFile }
  | { status: 'prompt' }
  | { status: 'error' };

/**
 * Tente de restaurer une entrée récente sans geste utilisateur.
 * - 'ok'     : fichier lu → lié (natif Tauri, ou permission navigateur déjà accordée).
 * - 'prompt' : permission à demander (bannière à afficher) — navigateur uniquement.
 * - 'error'  : fichier introuvable ou accès refusé définitivement.
 */
export async function restoreHandle(entry: RecentFile): Promise<RestoreResult> {
  if (entry.kind === 'native') {
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const file = parseTeamFile(await readTextFile(entry.path));
      currentHandle = { kind: 'native', path: entry.path };
      return { status: 'ok', opened: { file, name: entry.name, linked: true } };
    } catch {
      return { status: 'error' };
    }
  }
  if (!supportsHandlePersistence) return { status: 'error' };
  try {
    const perm = await entry.handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'prompt') return { status: 'prompt' };
    if (perm !== 'granted') return { status: 'error' };
    const blob = await entry.handle.getFile();
    const file = parseTeamFile(await blob.text());
    currentHandle = { kind: 'web', handle: entry.handle };
    return { status: 'ok', opened: { file, name: blob.name, linked: true } };
  } catch {
    return { status: 'error' };
  }
}

/**
 * Demande explicitement la permission (nécessite un geste utilisateur, navigateur uniquement).
 * Sous Tauri, aucune permission OS à demander : équivaut à `restoreHandle`.
 * Retourne le fichier si accordé/lu, null sinon.
 */
export async function requestAndRestoreHandle(entry: RecentFile): Promise<OpenedFile | null> {
  if (entry.kind === 'native') {
    const result = await restoreHandle(entry);
    return result.status === 'ok' ? result.opened : null;
  }
  if (!supportsHandlePersistence) return null;
  try {
    const perm = await entry.handle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') return null;
    const blob = await entry.handle.getFile();
    const file = parseTeamFile(await blob.text());
    currentHandle = { kind: 'web', handle: entry.handle };
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
