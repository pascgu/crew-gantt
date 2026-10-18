import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GanttLabels } from '@/core/model/types';
import { useAppStore } from '@/state/store';
import { setTasksGanttLabels } from '@/state/taskActions';
import type { ColKey } from '@/ui/table/tableStore';
import { t } from '@/i18n/fr';
import { useGanttColumnsStore } from './ganttColumnsStore';

/** Colonnes proposées autour des barres (même liste que le réglage global des Paramètres). */
export const GANTT_LABEL_KEYS: ColKey[] = [
  'name', 'group', 'project', 'estimate', 'effort', 'remaining', 'progress',
  'assignees', 'start', 'end', 'status',
];

export type LabelZone = 'before' | 'after' | 'center';

/** Puces à cocher d'une zone (avant / après / centre). */
export function ZoneChips({
  zone,
  selected,
  onToggle,
}: {
  zone: LabelZone;
  selected: readonly string[];
  onToggle: (key: ColKey) => void;
}) {
  const keys = zone === 'center' ? GANTT_LABEL_KEYS.filter((k) => k !== 'assignees') : GANTT_LABEL_KEYS;
  return (
    <div className="flex flex-wrap gap-1.5">
      {keys.map((key) => {
        const active = selected.includes(key);
        return (
          <button
            key={key}
            onClick={() => onToggle(key)}
            className={`rounded border px-2 py-0.5 text-[11.5px] transition ${
              active
                ? 'border-accent bg-accent-wash text-accent-deep'
                : 'border-line text-ink-soft hover:border-accent hover:text-ink'
            }`}
          >
            {t(`tasks.columns.${key}`)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Affichage Gantt propre à une sélection de tâches (T10) : surcharge enregistrée dans le fichier
 * (`task.ganttLabels`), appliquée à toute la sélection ; « Revenir au réglage global » la retire.
 */
export function GanttLabelsPopover({
  x,
  y,
  taskIds,
  onClose,
}: {
  x: number;
  y: number;
  taskIds: string[];
  onClose: () => void;
}) {
  const global = useGanttColumnsStore();
  const first = useAppStore((s) => s.file.tasks.find((tk) => tk.id === taskIds[0]));
  const start: GanttLabels = first?.ganttLabels ?? {
    before: [...global.before],
    after: [...global.after],
    center: [...global.center],
  };
  const [labels, setLabels] = useState<GanttLabels>(start);
  const hasOverride = useAppStore((s) => s.file.tasks.some((tk) => taskIds.includes(tk.id) && tk.ganttLabels));

  const toggle = (zone: LabelZone, key: string) =>
    setLabels((prev) => ({
      ...prev,
      [zone]: prev[zone].includes(key) ? prev[zone].filter((k) => k !== key) : [...prev[zone], key],
    }));

  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const zones: [LabelZone, string][] = [
    ['before', t('settings.colsBefore')],
    ['after', t('settings.colsAfter')],
    ['center', t('settings.colsCenter')],
  ];

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50 w-[340px] rounded-lg border border-line bg-surface shadow-float"
      style={{ left: Math.min(x, window.innerWidth - 350), top: Math.min(y, window.innerHeight - 330) }}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
        {taskIds.length > 1
          ? t('tasks.ganttLabelsTitleMany', { count: taskIds.length })
          : t('tasks.ganttLabelsTitle')}
      </p>
      <div className="flex flex-col gap-3 p-3">
        {zones.map(([zone, label]) => (
          <div key={zone}>
            <p className="mb-1 text-[11.5px] font-medium text-ink-soft">{label}</p>
            <ZoneChips zone={zone} selected={labels[zone]} onToggle={(k) => toggle(zone, k)} />
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t border-line px-3 py-2">
        <button
          className="flex-1 rounded bg-accent px-2 py-1 text-[11px] font-medium text-white hover:opacity-90"
          onClick={() => {
            setTasksGanttLabels(taskIds, labels);
            onClose();
          }}
        >
          {taskIds.length > 1 ? t('gantt.applyToMany', { count: taskIds.length }) : t('common.apply')}
        </button>
        <button
          className="flex-1 rounded border border-line px-2 py-1 text-[11px] text-ink-soft transition enabled:hover:text-ink disabled:opacity-40"
          disabled={!hasOverride}
          onClick={() => {
            setTasksGanttLabels(taskIds, null);
            onClose();
          }}
        >
          {t('tasks.ganttLabelsReset')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
