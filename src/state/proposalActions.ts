import { proposePlan, type Proposal } from '@/core/propose/propose';
import { todayIso } from '@/core/calendar/dates';
import type { TeamFile } from '@/core/model/types';
import { useAppStore } from './store';

interface ProposalCache {
  file: TeamFile | null;
  proposal: Proposal | null;
}

const cache: ProposalCache = { file: null, proposal: null };

/** Proposition memoïsée par référence de fichier. */
export function getProposal(file: TeamFile): Proposal | null {
  if (file !== cache.file) {
    cache.proposal = proposePlan(file, todayIso());
    cache.file = file;
  }
  return cache.proposal;
}

export function useProposal(): Proposal | null {
  const file = useAppStore((s) => s.file);
  return getProposal(file);
}

/** Clé stable d'une proposition — pour « ignorer » jusqu'au prochain changement réel. */
export function proposalKey(proposal: Proposal): string {
  return proposal.changes
    .map((c) => `${c.taskId}:${c.newStart}:${c.newEnd}:${c.date ?? ''}`)
    .join('|');
}

/** Applique tout ou partie (taskIds) de la proposition. Chaque application recalcule. */
export function applyProposal(proposal: Proposal, taskIds?: string[]): void {
  const only = taskIds ? new Set(taskIds) : null;
  useAppStore.getState().mutate((file) => {
    for (const change of proposal.changes) {
      if (only && !only.has(change.taskId)) continue;
      const task = file.tasks.find((t) => t.id === change.taskId);
      if (!task) continue;
      if (change.blocks) {
        task.blocks = change.blocks.map((b) => ({
          ...b,
          assignments: b.assignments.map((a) => ({ ...a })),
        }));
      }
      if (change.date) task.date = change.date;
    }
  });
}
