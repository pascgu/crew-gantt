import { TASK_PRIORITIES, type TaskPriority } from '@/core/model/types';
import { t } from '@/i18n/fr';

/**
 * Pastille de priorité (décision T2) : seule la pastille porte la couleur, le texte garde la sienne
 * — pas de confusion avec le rouge des conflits ni l'orange de la surcharge. « Normale » et
 * « masquée » n'ont pas de pastille.
 */
export const PRIORITY_COLOR: Record<TaskPriority, string | null> = {
  hidden: null,
  low: '#94a3b8',
  normal: null,
  high: '#f59e0b',
  urgent: '#e11d48',
};

export function priorityLabel(p: TaskPriority): string {
  return t(`tasks.priority.${p}`);
}

/** Pastille HTML (liste). Rien pour « normale » / « masquée » sauf `always`. */
export function PriorityDot({ priority, always, size = 8 }: { priority: TaskPriority; always?: boolean; size?: number }) {
  const color = PRIORITY_COLOR[priority];
  if (!color && !always) return null;
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: color ?? 'transparent',
        border: color ? undefined : '1px dashed var(--color-line-strong)',
      }}
      title={priorityLabel(priority)}
    />
  );
}

/** Sélecteur compact des 5 niveaux (pastilles cliquables), pour les menus. */
export function PriorityPicker({ value, onPick }: { value: TaskPriority | null; onPick: (p: TaskPriority) => void }) {
  return (
    <span className="flex items-center gap-1">
      {TASK_PRIORITIES.map((p) => (
        <button
          key={p}
          className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] transition ${
            value === p ? 'border-accent bg-accent-wash text-accent-deep' : 'border-line text-ink-soft hover:border-accent'
          }`}
          title={p === 'hidden' ? t('tasks.priorityHiddenHint') : priorityLabel(p)}
          onClick={(e) => {
            e.stopPropagation();
            onPick(p);
          }}
        >
          <PriorityDot priority={p} always />
          {priorityLabel(p)}
        </button>
      ))}
    </span>
  );
}
