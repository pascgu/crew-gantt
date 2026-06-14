import { useEffect, useRef, useState } from 'react';

interface EditableTextProps {
  value: string;
  onCommit: (value: string) => void;
  className?: string;
  placeholder?: string;
  bold?: boolean;
  autoEdit?: boolean;
  onAutoEditConsumed?: () => void;
}

/** Texte éditable en place : clic → champ, Entrée/blur → validation, Échap → abandon. */
export function EditableText({ value, onCommit, className, placeholder, bold, autoEdit, onAutoEditConsumed }: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoEdit && !editing) {
      setEditing(true);
      onAutoEditConsumed?.();
    }
  }, [autoEdit]);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing, value]);

  if (!editing) {
    return (
      <span
        className={`block cursor-text truncate rounded px-1 py-px hover:bg-paper-deep ${bold ? 'font-medium' : ''} ${value ? '' : 'text-ink-faint'} ${className ?? ''}`}
        onClick={() => setEditing(true)}
      >
        {value || placeholder || '—'}
      </span>
    );
  }
  return (
    <input
      ref={ref}
      className={`block w-full rounded border border-accent bg-surface px-1 py-px outline-none ${className ?? ''}`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(value);
          setEditing(false);
        }
      }}
    />
  );
}

interface EditableNumberProps {
  value: number | null;
  onCommit: (value: number | null) => void;
  className?: string;
  min?: number;
  max?: number;
  /** Autorise l'effacement (null). */
  nullable?: boolean;
  suffix?: string;
}

export function EditableNumber({
  value,
  onCommit,
  className,
  min = 0,
  max,
  nullable,
  suffix,
}: EditableNumberProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value === null ? '' : String(value));
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing, value]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() === '') {
      if (nullable && value !== null) onCommit(null);
      return;
    }
    const parsed = Number(draft.replace(',', '.'));
    if (Number.isNaN(parsed)) return;
    let v = parsed;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    if (v !== value) onCommit(v);
  };

  if (!editing) {
    return (
      <span
        className={`block cursor-text truncate rounded px-1 py-px text-right font-mono tabular-nums hover:bg-paper-deep ${value === null ? 'text-ink-faint' : ''} ${className ?? ''}`}
        onClick={() => setEditing(true)}
      >
        {value === null ? '—' : `${value}${suffix ?? ''}`}
      </span>
    );
  }
  return (
    <input
      ref={ref}
      inputMode="decimal"
      className={`block w-full rounded border border-accent bg-surface px-1 py-px text-right font-mono outline-none ${className ?? ''}`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setEditing(false);
      }}
    />
  );
}

interface DateInputProps {
  value: string | null;
  onCommit: (value: string | null) => void;
  nullable?: boolean;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

/** Champ date natif compact, valeur ISO YYYY-MM-DD. */
export function DateInput({
  value,
  onCommit,
  nullable,
  className,
  disabled,
  placeholder,
}: DateInputProps) {
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
      <input
        type="date"
        disabled={disabled}
        className="rounded border border-line bg-surface px-1 py-0.5 font-mono text-xs text-ink outline-none focus:border-accent disabled:opacity-50"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          if (v) onCommit(v);
          else if (nullable) onCommit(null);
        }}
      />
    </span>
  );
}
