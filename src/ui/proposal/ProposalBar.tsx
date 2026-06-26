import type { Proposal } from '@/core/propose/propose';
import { applyProposal } from '@/state/proposalActions';
import { t } from '@/i18n/fr';

interface ProposalBarProps {
  proposal: Proposal;
  onSeeImpacts: () => void;
  onDismiss: () => void;
}

/** Bandeau : une proposition existe — l'outil propose, l'humain dispose. */
export function ProposalBar({ proposal, onSeeImpacts, onDismiss }: ProposalBarProps) {
  const taskCount = proposal.changes.filter((c) => c.blocks).length;
  const milestoneCount = proposal.changes.filter((c) => c.date).length;
  return (
    <div className="flex items-center gap-3 border-b border-accent/30 bg-accent-wash px-3 py-1.5 text-[12.5px] text-accent-deep">
      <span className="font-medium">
        {t('proposal.banner', { tasks: taskCount, milestones: milestoneCount })}
      </span>
      <span className="flex-1" />
      <button
        className="rounded-md border border-accent/40 px-2.5 py-1 text-[11.5px] font-medium transition hover:bg-surface"
        onClick={onSeeImpacts}
      >
        {t('proposal.see')}
      </button>
      <button
        className="rounded-md bg-accent px-2.5 py-1 text-[11.5px] font-medium text-white transition hover:bg-accent-deep"
        onClick={() => applyProposal(proposal)}
      >
        {t('proposal.applyAll')}
      </button>
      <button
        className="rounded-md px-2 py-1 text-[11.5px] text-accent-deep/70 transition hover:text-accent-deep"
        onClick={onDismiss}
      >
        {t('proposal.dismiss')}
      </button>
    </div>
  );
}
