import { diffDays } from '@/core/calendar/dates';
import type { Proposal, TaskChange } from '@/core/propose/propose';
import { useAppStore } from '@/state/store';
import { applyProposal } from '@/state/proposalActions';
import { IconClose } from '@/ui/common/icons';
import { t } from '@/i18n/fr';
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
  if (change.oldEnd && change.newEnd && change.newEnd !== change.oldEnd) {
    const d = diffDays(change.oldEnd, change.newEnd);
    labels.push(t(d > 0 ? 'proposal.stretched' : 'proposal.shortened', { days: Math.abs(d) }));
  }
  return labels;
}

interface ImpactsPanelProps {
  proposal: Proposal;
  onClose: () => void;
}

/** Panneau Impacts : tâches décalées/découpées/étirées, jalons, deadlines. */
export function ImpactsPanel({ proposal, onClose }: ImpactsPanelProps) {
  const tasks = useAppStore((s) => s.file.tasks);
  const nameOf = (id: string) => tasks.find((tk) => tk.id === id)?.name ?? id;

  return (
    <div className="absolute right-3 top-12 z-40 flex max-h-[70%] w-96 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-float">
      <header className="flex items-center justify-between border-b border-line px-3 py-2">
        <h3 className="font-display text-[13px] font-semibold">{t('proposal.impactsTitle')}</h3>
        <div className="flex items-center gap-2">
          <button
            className="rounded-md bg-accent px-2.5 py-1 text-[11.5px] font-medium text-white transition hover:bg-accent-deep"
            onClick={() => {
              applyProposal(proposal);
              onClose();
            }}
          >
            {t('proposal.applyAll')}
          </button>
          <button className="rounded p-1 text-ink-soft hover:text-ink" onClick={onClose}>
            <IconClose size={13} />
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {proposal.changes.length === 0 && (
          <p className="p-3 text-[12px] text-ink-faint">{t('proposal.empty')}</p>
        )}
        {proposal.changes.map((change) => (
          <div
            key={change.taskId}
            className="mb-1.5 flex items-start gap-2 rounded-lg border border-line bg-paper/50 px-2.5 py-1.5"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium">{nameOf(change.taskId)}</p>
              <p className="text-[11.5px] text-ink-soft">{changeLabels(change).join(' · ')}</p>
              <p className="font-mono text-[10.5px] text-ink-faint">
                {fmtDay(change.oldStart)}–{fmtDay(change.oldEnd)} → {fmtDay(change.newStart)}–
                {fmtDay(change.newEnd)}
              </p>
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
    </div>
  );
}
