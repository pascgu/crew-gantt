/** true si l'app tourne dans le wrapper natif Tauri (et non un navigateur classique). */
export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
