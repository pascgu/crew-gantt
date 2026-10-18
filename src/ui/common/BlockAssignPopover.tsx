import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { todayIso } from '@/core/calendar/dates';
import type { Assignment } from '@/core/model/types';
import type { Schedule } from '@/core/scheduler/schedule';
import { useAppStore } from '@/state/store';
import { assignTeam } from '@/state/taskActions';
import { resourceAvatar } from '@/ui/common/Avatar';
import { t } from '@/i18n/fr';

/**
 * Affectation d'une ou plusieurs tâches. Sur une multi-sélection, l'équipe choisie **remplace**
 * celle de chaque tâche (une seule action annulable). Une tâche pas encore placée reçoit une
 * équipe prévue, reprise par son premier bloc.
 */
export function BlockAssignPopover({
  x,
  y,
  taskIds,
  blockId,
  schedule,
  onClose,
}: {
  x: number;
  y: number;
  /** Tâches visées ; la première est celle sur laquelle on a cliqué (équipe proposée au départ). */
  taskIds: string[];
  /** Bloc précis visé (clic sur un bloc du Gantt) ; défaut : le dernier bloc. */
  blockId?: string;
  schedule: Schedule;
  onClose: () => void;
}) {
  const file = schedule.ctx.file;
  const reviewDate = useAppStore((s) => s.reviewDate);
  const targets = taskIds
    .map((id) => file.tasks.find((tk) => tk.id === id))
    .filter((tk): tk is NonNullable<typeof tk> => tk?.type === 'task');
  const anchor = targets[0];
  const sortedBlocks = [...(anchor?.blocks ?? [])].sort((a, b) => a.from.localeCompare(b.from));
  const initialTeam =
    (blockId ? anchor?.blocks.find((b) => b.id === blockId) : sortedBlocks.at(-1))?.assignments ??
    anchor?.plannedAssignments ??
    [];
  const [assignments, setAssignmentsState] = useState<Assignment[]>(initialTeam.map((a) => ({ ...a })));
  const [splitHisto, setSplitHisto] = useState(false);
  const many = targets.length > 1;
  const anyPlaced = targets.some((tk) => tk.blocks.length > 0);
  // Ressources masquées : seulement si elles font déjà partie de l'équipe proposée.
  const shownResources = file.resources.filter(
    (r) => !r.hidden || initialTeam.some((a) => a.resourceId === r.id),
  );

  const setUnits = (resourceId: string, units: number) => {
    const u = Math.max(0, Math.min(1000, units));
    setAssignmentsState((prev) => {
      if (u === 0) return prev.filter((a) => a.resourceId !== resourceId);
      if (prev.some((a) => a.resourceId === resourceId)) {
        return prev.map((a) => (a.resourceId === resourceId ? { ...a, units: u } : a));
      }
      return [...prev, { resourceId, units: u }];
    });
  };

  const toggle = (resourceId: string) => {
    const cur = assignments.find((a) => a.resourceId === resourceId);
    setUnits(resourceId, cur ? 0 : 100);
  };

  const handleSave = () => {
    assignTeam(
      targets.map((tk) => tk.id),
      assignments,
      { blockId, split: splitHisto, date: reviewDate ?? todayIso() },
    );
    onClose();
  };

  const popRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const left = Math.min(x, window.innerWidth - 280);
  const top = Math.min(y, window.innerHeight - 380);
  const title = many
    ? t('gantt.assignManyTitle', { count: targets.length })
    : anyPlaced
      ? t('gantt.assignPopoverTitle')
      : t('gantt.assignPlannedTitle');

  return createPortal(
    <div
      ref={popRef}
      className="fixed z-50 w-[260px] rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-xl"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="border-b border-[var(--color-line)] px-3 py-2 text-[11px] font-semibold text-[var(--color-ink-soft)] uppercase tracking-wide">
        {title}
        {many && (
          <p className="mt-0.5 text-[10.5px] font-normal normal-case tracking-normal text-[var(--color-ink-faint)]">
            {t('gantt.assignReplaceHint')}
          </p>
        )}
        {!anyPlaced && (
          <p className="mt-0.5 text-[10.5px] font-normal normal-case tracking-normal text-[var(--color-ink-faint)]">
            {t('gantt.assignPlannedHint')}
          </p>
        )}
      </div>
      <div className="max-h-60 overflow-y-auto p-2 space-y-2">
        {shownResources.map((r) => {
          const units = assignments.find((a) => a.resourceId === r.id)?.units ?? 0;
          const active = units > 0;
          const { color, label } = resourceAvatar(r);
          return (
            <div key={r.id} className={`flex items-center gap-2 rounded px-1 py-0.5 ${active ? '' : 'opacity-40'}`}>
              <button
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white transition hover:scale-110 cursor-pointer"
                style={{ background: color }}
                title={active ? t('gantt.removePerson', { name: r.name }) : t('gantt.addPerson', { name: r.name })}
                onClick={() => toggle(r.id)}
              >
                {label}
              </button>
              <input
                type="range"
                min={0}
                max={200}
                step={5}
                value={units}
                onChange={(e) => setUnits(r.id, Number(e.target.value))}
                className="flex-1 accent-[var(--color-accent)]"
                title={`${r.name} : ${units} %`}
              />
              <span className="w-9 shrink-0 text-right font-mono text-[11px] text-[var(--color-ink-soft)]">
                {units} %
              </span>
            </div>
          );
        })}
      </div>
      {anyPlaced && (
        <label className="flex items-center gap-2 border-t border-[var(--color-line)] px-3 py-2 text-[11.5px] text-[var(--color-ink-soft)]">
          <input
            type="checkbox"
            checked={splitHisto}
            onChange={(e) => setSplitHisto(e.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          {t('gantt.newBlockHisto')}
        </label>
      )}
      <div className="flex gap-2 border-t border-[var(--color-line)] px-3 py-2">
        <button
          className="flex-1 rounded bg-[var(--color-accent)] px-2 py-1 text-[11px] font-medium text-white hover:opacity-90"
          onClick={handleSave}
        >
          {many ? t('gantt.applyToMany', { count: targets.length }) : t('common.apply')}
        </button>
        <button
          className="flex-1 rounded border border-[var(--color-line)] px-2 py-1 text-[11px] hover:bg-[var(--color-wash)]"
          onClick={onClose}
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
