import { useMemo, useState } from 'react';
import { addDays } from '@/core/calendar/dates';
import { freeCapacity } from '@/core/scheduler/workload';
import type { Schedule } from '@/core/scheduler/schedule';
import type { Block, IsoDate, Task } from '@/core/model/types';
import { useAppStore } from '@/state/store';
import { setBlockAssignments } from '@/state/taskActions';
import { IconPlus, IconWarning } from '@/ui/common/icons';
import { t } from '@/i18n/fr';
import { fmtDay } from '@/ui/gantt/format';

interface AssignmentAssistantProps {
  task: Task;
  block: Block;
  /** Fin résolue du bloc (fenêtre d'analyse). */
  resolvedTo: IsoDate | null;
  schedule: Schedule;
}

/**
 * Aide à l'affectation : ressources triées par capacité libre sur la fenêtre
 * du bloc, prérequis affichés bien en vue. Tri et chiffres exacts, décision humaine.
 */
export function AssignmentAssistant({ task, block, resolvedTo, schedule }: AssignmentAssistantProps) {
  const resources = useAppStore((s) => s.file.resources);
  const [open, setOpen] = useState(false);

  const from = block.from;
  const to = resolvedTo && resolvedTo > from ? resolvedTo : addDays(from, 13);

  const ranked = useMemo(() => {
    if (!open) return [];
    return resources
      .map((resource) => ({
        resource,
        ...freeCapacity(schedule.ctx, schedule.loadIndex, resource.id, from, to),
        assigned: block.assignments.some((a) => a.resourceId === resource.id),
      }))
      .sort((a, b) => b.free - a.free);
  }, [open, resources, schedule, from, to, block.assignments]);

  if (!open) {
    return (
      <button
        className="flex items-center gap-1 self-start rounded border border-dashed border-line px-1.5 py-0.5 text-[11.5px] text-ink-soft transition hover:border-accent hover:text-accent"
        onClick={() => setOpen(true)}
      >
        <IconPlus size={10} /> {t('panel.addAssignment')}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-accent/40 bg-surface p-2 shadow-panel">
      <div className="mb-1 flex items-baseline justify-between">
        <p className="text-[11.5px] font-semibold text-ink">{t('assist.title')}</p>
        <span className="font-mono text-[10.5px] text-ink-faint">
          {t('assist.window', { from: fmtDay(from), to: fmtDay(to) })}
        </span>
      </div>
      {task.requirements && (
        <p className="mb-1.5 flex items-start gap-1.5 rounded bg-warn-wash px-2 py-1 text-[11.5px] leading-snug text-ink">
          <IconWarning size={12} className="mt-0.5 shrink-0 text-warn" />
          {task.requirements}
        </p>
      )}
      <div className="flex max-h-44 flex-col gap-0.5 overflow-y-auto">
        {ranked.map(({ resource, free, presenceTotal, assigned }) => (
          <button
            key={resource.id}
            disabled={assigned}
            className="flex items-center gap-2 rounded px-1.5 py-1 text-left text-[12px] transition enabled:hover:bg-accent-wash disabled:opacity-45"
            onClick={() => {
              setBlockAssignments(task.id, block.id, [
                ...block.assignments,
                { resourceId: resource.id, units: 100 },
              ]);
              setOpen(false);
            }}
          >
            <span className="w-20 truncate font-medium">{resource.name}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-paper-deep">
              <span
                className="block h-full rounded-full bg-ok"
                style={{
                  width: `${presenceTotal > 0 ? Math.round((free / presenceTotal) * 100) : 0}%`,
                }}
              />
            </span>
            <span className="w-16 shrink-0 text-right font-mono text-[11px] text-ink-soft">
              {assigned
                ? t('assist.alreadyAssigned')
                : t('assist.freeDays', { days: String(free).replace('.', ',') })}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
