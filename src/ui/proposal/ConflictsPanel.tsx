import { useState, useEffect } from 'react';
import type { Conflict } from '@/core/conflicts/detect';
import { useAppStore } from '@/state/store';
import { useConflicts, useSchedule } from '@/state/schedule';
import { toggleIgnoredConflict } from '@/state/taskActions';
import { useUiStore } from '@/state/uiStore';
import { IconClose, IconWarning } from '@/ui/common/icons';
import { t, type TranslationKey } from '@/i18n/fr';
import { fmtDay } from '@/ui/gantt/format';

function useConflictMessage(): (c: Conflict) => string {
  const tasks = useAppStore((s) => s.file.tasks);
  const resources = useAppStore((s) => s.file.resources);
  const projects = useAppStore((s) => s.file.projects);
  return (c) =>
    t(`conflicts.messages.${c.type}` as TranslationKey, {
      task: tasks.find((tk) => tk.id === c.taskId)?.name ?? c.taskId ?? '',
      resource: resources.find((r) => r.id === c.resourceId)?.name ?? c.resourceId ?? '',
      project: projects.find((p) => p.id === c.projectId)?.name ?? c.projectId ?? '',
      date: fmtDay(c.date),
      amount: Math.round((c.amount ?? 0) * 10) / 10,
    });
}

interface ConflictsPanelProps {
  onClose: () => void;
  onSelectTask: (taskId: string) => void;
}

/** Panneau Conflits : actifs + ignorés (gris, consultables, réactivables). */
export function ConflictsPanel({ onClose, onSelectTask }: ConflictsPanelProps) {
  const { active, ignored } = useConflicts();
  const schedule = useSchedule();
  const tasks = useAppStore((s) => s.file.tasks);
  const resources = useAppStore((s) => s.file.resources);
  const message = useConflictMessage();
  const focusTaskId = useUiStore((s) => s.focusConflictTaskId);
  const [taskFilter, setTaskFilter] = useState<string>(focusTaskId ?? '');

  useEffect(() => {
    setTaskFilter(focusTaskId ?? '');
  }, [focusTaskId]);

  // Tâches distinctes qui ont au moins un conflit actif
  const taskIds = [...new Set(active.map((c) => c.taskId).filter(Boolean))] as string[];

  const filterFn = (c: Conflict) => !taskFilter || c.taskId === taskFilter;

  const renderConflict = (c: Conflict, isIgnored: boolean) => (
    <div
      key={c.id}
      className={`mb-1.5 flex items-start gap-2 rounded-lg border px-2.5 py-1.5 ${
        isIgnored ? 'border-line bg-paper/40 opacity-60' : 'border-danger/25 bg-danger-wash/50'
      }`}
    >
      <IconWarning size={13} className={`mt-0.5 shrink-0 ${isIgnored ? 'text-ink-faint' : 'text-danger'}`} />
      <div className="min-w-0 flex-1">
        <button
          className="block truncate text-left text-[12px] font-semibold hover:underline"
          onClick={() => c.taskId && onSelectTask(c.taskId)}
        >
          {t(`conflicts.types.${c.type}`)}
        </button>
        <p className="text-[11.5px] leading-snug text-ink-soft">{message(c)}</p>
      </div>
      <button
        className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10.5px] text-ink-soft transition hover:border-accent hover:text-accent"
        onClick={() => toggleIgnoredConflict(c.id)}
      >
        {isIgnored ? t('conflicts.unignore') : t('conflicts.ignore')}
      </button>
    </div>
  );

  return (
    <div className="absolute right-3 top-12 z-40 flex max-h-[70%] w-96 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-float">
      <header className="flex items-center justify-between border-b border-line px-3 py-2">
        <h3 className="font-display text-[13px] font-semibold">
          {t('conflicts.title')} <span className="text-danger">({active.length})</span>
        </h3>
        <button className="rounded p-1 text-ink-soft hover:text-ink" onClick={onClose}>
          <IconClose size={13} />
        </button>
      </header>
      {/* Filtre par tâche */}
      {taskIds.length > 1 && (
        <div className="border-b border-line px-3 py-1.5">
          <select
            className="w-full rounded border border-line bg-surface px-1.5 py-0.5 text-[11.5px] text-ink"
            value={taskFilter}
            onChange={(e) => setTaskFilter(e.target.value)}
          >
            <option value="">{t('conflicts.filterAll')}</option>
            {taskIds.map((id) => (
              <option key={id} value={id}>{tasks.find((tk) => tk.id === id)?.name ?? id}</option>
            ))}
          </select>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {/* Cycle de dépendances : cas rare (prévenu à la création), mais possible si le fichier
            a été édité manuellement. Affiché en priorité, bloque le calcul. */}
        {schedule.cycle && (
          <div className="mb-2 rounded-lg border border-danger/40 bg-danger-wash/60 px-2.5 py-1.5">
            <p className="text-[12px] font-semibold text-danger">{t('conflicts.types.cycle')}</p>
            <p className="text-[11.5px] leading-snug text-ink-soft">
              {t('conflicts.cycle', { tasks: schedule.cycle.join(' → ') })}
            </p>
          </div>
        )}
        {active.filter(filterFn).length === 0 && active.length === 0 && !schedule.cycle && (
          <p className="p-3 text-[12px] text-ok">{t('conflicts.none')}</p>
        )}
        {active.filter(filterFn).map((c) => renderConflict(c, false))}

        {/* Sur-engagement : avertissement doux, jamais un conflit rouge */}
        {schedule.overEngagements.map((o) => (
          <div
            key={`${o.resourceId}-${o.from}`}
            className="mb-1.5 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-wash/60 px-2.5 py-1.5"
          >
            <IconWarning size={13} className="mt-0.5 shrink-0 text-warn" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold">{t('conflicts.overEngagement')}</p>
              <p className="text-[11.5px] leading-snug text-ink-soft">
                {t('conflicts.overEngagementMsg', {
                  resource: resources.find((r) => r.id === o.resourceId)?.name ?? o.resourceId,
                  from: fmtDay(o.from),
                  to: fmtDay(o.to),
                  peak: Math.round(o.peak * 100) / 100,
                })}
              </p>
            </div>
          </div>
        ))}

        {ignored.filter(filterFn).length > 0 && (
          <>
            <p className="mb-1 mt-3 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              {t('conflicts.ignored')} ({ignored.filter(filterFn).length})
            </p>
            {ignored.filter(filterFn).map((c) => renderConflict(c, true))}
          </>
        )}
      </div>
    </div>
  );
}
