import { addDays, maxIso } from '../calendar/dates';
import type { IsoDate, Task, TeamFile } from '../model/types';
import { effortCapacityOnDay } from './blocks';
import { createCalcContext, type CalcContext } from './context';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Le `remaining` stocké d'une tâche effort vaut à la date du jour (`ref`). Vu depuis une autre date
 * (`at`, la date de réunion), le travail planifié entre les deux s'est fait — ou reste à faire :
 * - `at` après `ref` : la capacité des blocs sur [ref, at[ est consommée → le reste baisse ;
 * - `at` avant `ref` : la capacité sur [at, ref[ redevient à faire → le reste monte.
 * Renvoie ce décalage signé (j-h) : reste vu à `at` = max(0, stocké − décalage). Rien n'est écrit :
 * l'aller-retour de date est neutre et les fins calculées ne bougent pas.
 * Tâches terminées, fixed, hors calculs : 0.
 */
export function remainingShift(ctx: CalcContext, task: Task, ref: IsoDate, at: IsoDate): number {
  if (ref === at || task.type !== 'task' || task.scheduling !== 'effort') return 0;
  if (task.status === 'done' || !ctx.isCounted(task)) return 0;
  const [lo, hi] = ref < at ? [ref, at] : [at, ref];
  let total = 0;
  for (const block of task.blocks) {
    for (let d = maxIso(block.from, lo); d < hi && (block.to === null || d <= block.to); d = addDays(d, 1)) {
      total += effortCapacityOnDay(ctx, task, block, d);
    }
  }
  return round2(ref < at ? total : -total);
}

/**
 * Vue du fichier « à la date `at` » : restes des tâches effort décalés de {@link remainingShift}.
 * Les tâches inchangées gardent leur référence ; sans décalage, le fichier est rendu tel quel.
 */
export function fileAsOf(file: TeamFile, ref: IsoDate, at: IsoDate): TeamFile {
  if (ref === at) return file;
  const ctx = createCalcContext(file, at);
  let changed = false;
  const tasks = file.tasks.map((task) => {
    const shift = remainingShift(ctx, task, ref, at);
    if (shift === 0) return task;
    changed = true;
    return { ...task, remaining: round2(Math.max(0, task.remaining - shift)) };
  });
  return changed ? { ...file, tasks } : file;
}

/** Reste à stocker pour qu'une tâche vaille `seen` à la date `at` (inverse de la vue). */
export function storedRemainingFor(file: TeamFile, task: Task, ref: IsoDate, at: IsoDate, seen: number): number {
  if (ref === at) return round2(Math.max(0, seen));
  const shift = remainingShift(createCalcContext(file, at), task, ref, at);
  return round2(Math.max(0, seen + shift));
}
