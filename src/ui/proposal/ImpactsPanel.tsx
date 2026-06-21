import { useEffect, useState } from 'react';
import { diffDays } from '@/core/calendar/dates';
import type { ChangeReason, Proposal, TaskChange } from '@/core/propose/propose';
import { useAppStore } from '@/state/store';
import { applyProposal, proposalKey } from '@/state/proposalActions';
import { useUiStore } from '@/state/uiStore';
import { IconClose } from '@/ui/common/icons';
import { t, type TranslationKey } from '@/i18n/fr';
import { fmtDay } from '@/ui/gantt/format';

function changeLabels(change: TaskChange): string[] {
  const labels: string[] = [];
  if (change.date && change.oldStart && change.newStart) {
    labels.push(
      t('proposal.milestoneShift', {
        days: diffDays(change.oldStart, change.newStart),
        from: fmtDay(change.oldStart),
        to: fmtDay(change.newStart),
      }),
    );
    return labels;
  }
  if (change.oldStart && change.newStart && change.newStart !== change.oldStart) {
    labels.push(t('proposal.shifted', { days: diffDays(change.oldStart, change.newStart) }));
  }
  if (change.newBlockCount > change.oldBlockCount) {
    labels.push(
      t('proposal.split', { from: change.oldBlockCount, to: change.newBlockCount }),
    );
  }
  // Étirement = variation de DURÉE, pas de date de fin : un décalage pur déplace
  // début et fin du même delta (durée inchangée) → ne doit pas être signalé « étirée ».
  if (change.oldStart && change.oldEnd && change.newStart && change.newEnd) {
    const oldDur = diffDays(change.oldStart, change.oldEnd);
    const newDur = diffDays(change.newStart, change.newEnd);
    const d = newDur - oldDur;
    if (d !== 0) {
      labels.push(t(d > 0 ? 'proposal.stretched' : 'proposal.shortened', { days: Math.abs(d) }));
    }
  }
  return labels;
}

interface ImpactsPanelProps {
  proposal: Proposal;
  onClose: () => void;
  onSelectTask?: (taskId: string) => void;
}

function reasonLabel(reason: ChangeReason, nameOf: (id: string) => string): string {
  if (reason.type === 'cascade') return t('proposal.reason.cascade', { task: nameOf(reason.taskId ?? '') });
  if (reason.type === 'link-violated') return t('proposal.reason.link-violated', { task: nameOf(reason.taskId ?? '') });
  return t('proposal.reason.effort-overflow' as TranslationKey);
}

/** Panneau Impacts : résumé + tâches décalées/découpées/étirées, jalons, deadlines. */
export function ImpactsPanel({ proposal, onClose, onSelectTask }: ImpactsPanelProps) {
  const tasks = useAppStore((s) => s.file.tasks);
  const { dismissProposal } = useUiStore();
  const focusProposalTaskId = useUiStore((s) => s.focusProposalTaskId);
  const nameOf = (id: string) => tasks.find((tk) => tk.id === id)?.name ?? id;

  const [taskFilter, setTaskFilter] = useState<string | null>(null);

  useEffect(() => {
    if (focusProposalTaskId) setTaskFilter(focusProposalTaskId);
  }, [focusProposalTaskId]);

  const taskCount = proposal.changes.filter((c) => c.blocks).length;
  const milestoneCount = proposal.changes.filter((c) => c.date).length;

  const visibleChanges = taskFilter
    ? proposal.changes.filter((c) => c.taskId === taskFilter)
    : proposal.changes;

  return (
    <div className="absolute right-3 top-12 z-40 flex max-h-[70%] w-96 flex-col overflow-hidden rounded-xl border border-accent/30 bg-surface shadow-float">
      <header className="flex items-center justify-between border-b border-line px-3 py-2">
        <div>
          <h3 className="font-display text-[13px] font-semibold">{t('proposal.impactsTitle')}</h3>
          <p className="text-[11px] text-ink-soft">
            {t('proposal.banner', { tasks: taskCount, milestones: milestoneCount })}
          </p>
        </div>
        <button className="rounded p-1 text-ink-soft hover:text-ink" onClick={onClose}>
          <IconClose size={13} />
        </button>
      </header>

      {/* Filtre par tâche (combo, identique au panneau Conflits) */}
      {proposal.changes.length > 1 && (
        <div className="border-b border-line px-3 py-1.5">
          <select
            className="w-full rounded border border-line bg-surface px-1.5 py-0.5 text-[11.5px] text-ink"
            value={taskFilter ?? ''}
            onChange={(e) => setTaskFilter(e.target.value || null)}
          >
            <option value="">{t('proposal.filterAll')}</option>
            {proposal.changes.map((c) => (
              <option key={c.taskId} value={c.taskId}>{nameOf(c.taskId)}</option>
            ))}
          </select>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {visibleChanges.length === 0 && (
          <p className="p-3 text-[12px] text-ink-faint">{t('proposal.empty')}</p>
        )}
        {visibleChanges.map((change) => (
          <div
            key={change.taskId}
            className="mb-1.5 flex items-start gap-2 rounded-lg border border-line bg-paper/50 px-2.5 py-1.5"
          >
            <div className="min-w-0 flex-1">
              <button
                className="truncate text-left text-[12.5px] font-medium hover:text-accent hover:underline"
                onClick={() => onSelectTask?.(change.taskId)}
              >
                {nameOf(change.taskId)}
              </button>
              <p className="text-[11.5px] text-ink-soft">{changeLabels(change).join(' · ')}</p>
              <p className="font-mono text-[10.5px] text-ink-faint">
                {fmtDay(change.oldStart)}–{fmtDay(change.oldEnd)} → {fmtDay(change.newStart)}–
                {fmtDay(change.newEnd)}
              </p>
              {change.reason && (
                <p className="text-[10.5px] text-ink-faint">
                  {t('proposal.reason.label' as TranslationKey)} {reasonLabel(change.reason, nameOf)}
                </p>
              )}
            </div>
            <button
              className="shrink-0 rounded border border-accent/40 px-2 py-0.5 text-[11px] font-medium text-accent transition hover:bg-accent-wash"
              onClick={() => applyProposal(proposal, [change.taskId])}
            >
              {t('proposal.apply')}
            </button>
          </div>
        ))}
        {proposal.threatenedDeadlines.length > 0 && (
          <>
            <p className="mb-1 mt-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-danger">
              {t('proposal.deadlines')}
            </p>
            {proposal.threatenedDeadlines.map((d) => (
              <p
                key={d.taskId}
                className="mb-1 rounded bg-danger-wash px-2.5 py-1 text-[11.5px] text-ink"
              >
                {t('proposal.deadlineLine', {
                  task: nameOf(d.taskId),
                  end: fmtDay(d.end),
                  deadline: fmtDay(d.deadline),
                })}
              </p>
            ))}
          </>
        )}
      </div>
      {/* Pied « Tout appliquer / Ignorer » : masqué si un filtre est actif (lever l'ambiguïté). */}
      {!taskFilter && (
        <div className="flex gap-2 border-t border-line px-3 py-2">
          <button
            className="flex-1 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-accent-deep"
            onClick={() => { applyProposal(proposal); onClose(); }}
          >
            {t('proposal.applyAll')}
          </button>
          <button
            className="rounded-md border border-line px-3 py-1.5 text-[12px] text-ink-soft transition hover:text-ink"
            onClick={() => { dismissProposal(proposalKey(proposal)); onClose(); }}
          >
            {t('proposal.dismiss')}
          </button>
        </div>
      )}
    </div>
  );
}
