import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface MenuEntry {
  label: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Infobulle (ex. explication d'une entrée grisée). */
  title?: string;
}

interface ContextMenuProps {
  x: number;
  y: number;
  entries: MenuEntry[];
  onClose: () => void;
}

/** Menu contextuel minimal — fermé au clic ailleurs ou à Échap. */
export function ContextMenu({ x, y, entries, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  // Reste dans la fenêtre
  const left = Math.min(x, window.innerWidth - 240);
  const top = Math.min(y, window.innerHeight - entries.length * 34 - 16);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50 min-w-52 rounded-lg border border-line bg-surface py-1 shadow-float"
      style={{ left, top }}
    >
      {entries.map((entry, i) => (
        <button
          key={i}
          disabled={entry.disabled}
          title={entry.title}
          className={`block w-full px-3 py-1.5 text-left text-[13px] transition disabled:opacity-40 ${
            entry.danger ? 'text-danger hover:bg-danger-wash' : 'text-ink hover:bg-paper-deep'
          }`}
          onClick={() => {
            entry.onClick();
            onClose();
          }}
        >
          {entry.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
