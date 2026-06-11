import type { IsoDate, Task } from '../model/types';
import { addDays, diffDays } from '../calendar/dates';
import type { ResolvedBlock } from './blocks';

export interface Interval {
  from: IsoDate;
  to: IsoDate;
}

/**
 * Union d'intervalles : fusionne ceux qui se chevauchent ou se touchent
 * (fin + 1 jour = début suivant). Le résultat est trié.
 */
export function unionIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.from.localeCompare(b.from));
  const out: Interval[] = [{ ...sorted[0]! }];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const last = out[out.length - 1]!;
    if (current.from <= addDays(last.to, 1)) {
      if (current.to > last.to) last.to = current.to;
    } else {
      out.push({ ...current });
    }
  }
  return out;
}

export interface GroupAggregate {
  /** Union des blocs de tous les descendants — la barre résumé est découpée pareil. */
  intervals: Interval[];
  /** Étendue totale du ruban (liaisons comprises). */
  span: { start: IsoDate; end: IsoDate } | null;
  effortTotal: number;
  effortRealized: number;
  /** Avancement pondéré = effort réalisé cumulé ÷ effort total (0 si effort nul). */
  progress: number;
}

/**
 * Agrégats d'un groupe : union des blocs des descendants (les jalons, sans
 * blocs, n'y contribuent pas), somme des efforts, avancement pondéré.
 */
export function aggregateGroup(
  descendants: Task[],
  resolvedByTask: ReadonlyMap<string, ResolvedBlock[]>,
): GroupAggregate {
  const intervals: Interval[] = [];
  let effortTotal = 0;
  let effortRealized = 0;
  for (const task of descendants) {
    if (task.type === 'group') continue; // leurs efforts sont déjà portés par leurs feuilles
    effortTotal += task.effort;
    effortRealized += Math.max(0, task.effort - task.remaining);
    for (const r of resolvedByTask.get(task.id) ?? []) {
      intervals.push({ from: r.from, to: r.to });
    }
  }
  const union = unionIntervals(intervals);
  const span =
    union.length > 0
      ? { start: union[0]!.from, end: union[union.length - 1]!.to }
      : null;
  return {
    intervals: union,
    span,
    effortTotal,
    effortRealized,
    progress: effortTotal > 0 ? effortRealized / effortTotal : 0,
  };
}

/**
 * Règle de rendu unique de l'avancement (groupes comme tâches découpées) :
 * la barre remplit `progress` × largeur calendaire totale du ruban, liaisons
 * comprises — elle peut se terminer « dans un trou », c'est voulu.
 * Retourne le nombre de jours calendaires couverts (fraction comprise),
 * à partir de `span.start`.
 */
export function progressBarDays(span: { start: IsoDate; end: IsoDate }, progress: number): number {
  const totalDays = diffDays(span.start, span.end) + 1;
  return Math.max(0, Math.min(1, progress)) * totalDays;
}

/** Avancement d'une tâche simple : effort réalisé ÷ effort. */
export function taskProgress(task: { effort: number; remaining: number }): number {
  if (task.effort <= 0) return 0;
  return Math.max(0, Math.min(1, (task.effort - task.remaining) / task.effort));
}
