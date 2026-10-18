import { create } from 'zustand';

/**
 * État des touches Ctrl / Shift, unique pour toute l'app (écouteurs posés une fois sur la fenêtre).
 * Remis à zéro quand la fenêtre perd le focus (une boîte de dialogue avale le keyup) : sans ça, une
 * ligne pouvait garder son « + » rouge de suppression alors que Ctrl était relâché.
 */
export const useModifierKeys = create<{ ctrl: boolean; shift: boolean }>(() => ({ ctrl: false, shift: false }));

if (typeof window !== 'undefined') {
  const sync = (e: KeyboardEvent | MouseEvent) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const { ctrl: c, shift: s } = useModifierKeys.getState();
    if (c !== ctrl || s !== e.shiftKey) useModifierKeys.setState({ ctrl, shift: e.shiftKey });
  };
  window.addEventListener('keydown', sync, true);
  window.addEventListener('keyup', sync, true);
  window.addEventListener('mousemove', sync, true);
  window.addEventListener('blur', () => useModifierKeys.setState({ ctrl: false, shift: false }));
}
