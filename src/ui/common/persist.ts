import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * useState persisté en localStorage (préférences d'affichage : largeur de la
 * table, bandeau de charge…). Hors du fichier équipe : ne le marque pas dirty.
 */
export function usePersistedState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // stockage plein ou indisponible (navigation privée) : préférence non retenue
    }
  }, [key, value]);
  return [value, setValue];
}
