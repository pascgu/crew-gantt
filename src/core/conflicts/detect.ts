import type { IsoDate } from '../model/types';
import { diffDays, eachDay, isBetween } from '../calendar/dates';
import { plannedFutureCapacity } from '../scheduler/blocks';
import type { Schedule } from '../scheduler/schedule';

export type ConflictType =
  | 'link-violated'
  | 'project-overload'
  | 'no-capacity'
  | 'effort-overflow'
  | 'deadline'
  | 'milestone-untenable'
  | 'unassigned';

export interface Conflict {
  /** Id stable (type + sujets, sans date) : « ignorer » survit aux recalculs. */
  id: string;
  type: ConflictType;
  taskId?: string;
  resourceId?: string;
  projectId?: string;
  /** Premier jour concerné. */
  date?: IsoDate;
  /** Écart en jours (retard, dérive…) ou en j-h selon le type. */
  amount?: number;
}

function conflictId(
  type: ConflictType,
  taskId?: string,
  resourceId?: string,
  projectId?: string,
): string {
  return [type, taskId ?? '', resourceId ?? '', projectId ?? ''].join(':');
}

/** Détection des 7 familles de conflits du GDD. Pure : ne modifie rien. */
export function detectConflicts(schedule: Schedule): Conflict[] {
  const out: Conflict[] = [];
  const { ctx, resolvedByTask, spanByTask, earliestByTask } = schedule;
  const today = ctx.today;

  for (const task of ctx.file.tasks) {
    const span = spanByTask.get(task.id) ?? null;
    const earliest = earliestByTask.get(task.id);

    // 1 & 6 — Lien violé / jalon intenable : placé avant son point autorisé.
    if (earliest?.date) {
      if (task.type === 'milestone') {
        if (task.date && task.date < earliest.date) {
          out.push({
            id: conflictId('milestone-untenable', task.id),
            type: 'milestone-untenable',
            taskId: task.id,
            date: earliest.date,
            amount: diffDays(task.date, earliest.date),
          });
        }
      } else if (span && span.start < earliest.date) {
        out.push({
          id: conflictId('link-violated', task.id),
          type: 'link-violated',
          taskId: task.id,
          date: earliest.date,
          amount: diffDays(span.start, earliest.date),
        });
      }
    }

    // 5 — Deadline menacée : fin planifiée au-delà.
    if (task.deadline && span && span.end > task.deadline) {
      out.push({
        id: conflictId('deadline', task.id),
        type: 'deadline',
        taskId: task.id,
        date: task.deadline,
        amount: diffDays(task.deadline, span.end),
      });
    }

    if (task.type !== 'task') continue;
    const resolved = resolvedByTask.get(task.id) ?? [];

    // 3 — Travail sans capacité. Deux cas : une absence datée (exception à 0 %)
    // tombe dans un bloc fermé, ou une affectation n'a aucune capacité sur tout
    // son bloc. Le motif hebdo et les fériés, récurrents, sont absorbés sans bruit
    // par le calcul de capacité — seuls les événements datés alertent.
    for (const r of resolved) {
      if (r.to < today || task.status === 'done') continue; // l'historique ne crie pas
      for (const assignment of r.block.assignments) {
        const resource = ctx.resourcesById.get(assignment.resourceId);
        if (!resource) continue;
        let exceptionDay: IsoDate | undefined;
        if (!r.computed) {
          outer: for (const ex of resource.exceptions) {
            if (ex.percent > 0) continue;
            for (const day of eachDay(r.from, r.to)) {
              if (!ctx.isGlobalWorkingDay(day)) continue;
              if (isBetween(day, ex.from, ex.to ?? ex.from)) {
                exceptionDay = day;
                break outer;
              }
            }
          }
        }
        let wholeBlockDead = true;
        for (const day of eachDay(r.from, r.to)) {
          if (ctx.assignmentCapacity(assignment.resourceId, task.projectId, assignment.units, day) > 0) {
            wholeBlockDead = false;
            break;
          }
        }
        if (exceptionDay !== undefined || wholeBlockDead) {
          out.push({
            id: conflictId('no-capacity', task.id, assignment.resourceId),
            type: 'no-capacity',
            taskId: task.id,
            resourceId: assignment.resourceId,
            date: exceptionDay ?? r.from,
          });
        }
      }
    }

    // 4 — Effort non casé : le reste à faire ne tient pas dans les blocs prévus.
    if (task.scheduling === 'effort' && task.remaining > 1e-9 && resolved.length > 0) {
      const open = resolved.find((r) => r.computed);
      if (open?.overflow) {
        out.push({
          id: conflictId('effort-overflow', task.id),
          type: 'effort-overflow',
          taskId: task.id,
          date: open.from,
          amount: task.remaining,
        });
      } else if (!open) {
        // Seule la capacité encore à venir peut absorber le reste à faire.
        let capacity = 0;
        for (const r of resolved) capacity += plannedFutureCapacity(ctx, task, r.block);
        if (capacity < task.remaining - 1e-9) {
          out.push({
            id: conflictId('effort-overflow', task.id),
            type: 'effort-overflow',
            taskId: task.id,
            date: resolved[resolved.length - 1]!.from,
            amount: task.remaining - capacity,
          });
        }
      }
    }

    // 7 — Tâche non affectée : en mode effort, personne sur le bloc à venir.
    if (task.scheduling === 'effort' && task.remaining > 1e-9 && task.status !== 'done') {
      const upcoming = resolved.filter((r) => r.computed || r.to >= today);
      const unmanned =
        resolved.length === 0 || upcoming.some((r) => r.block.assignments.length === 0);
      if (unmanned) {
        out.push({
          id: conflictId('unassigned', task.id),
          type: 'unassigned',
          taskId: task.id,
          date: upcoming.find((r) => r.block.assignments.length === 0)?.from,
        });
      }
    }
  }

  // 2 — Surcharge projet : pour une personne, un jour donné, Σ des % affectés
  // aux tâches d'un même projet > 100 % de sa part projet.
  for (const [resourceId, days] of schedule.loadIndex) {
    const reported = new Set<string>();
    const sortedDays = [...days.keys()].sort();
    for (const day of sortedDays) {
      const load = days.get(day)!;
      for (const [projectId, units] of Object.entries(load.unitsByProject)) {
        if (units > 100 + 1e-9 && !reported.has(projectId)) {
          reported.add(projectId);
          out.push({
            id: conflictId('project-overload', undefined, resourceId, projectId),
            type: 'project-overload',
            resourceId,
            projectId,
            date: day,
            amount: units - 100,
          });
        }
      }
    }
  }

  return out;
}

/** Sépare conflits actifs et conflits explicitement ignorés (gris, consultables). */
export function splitIgnored(
  conflicts: Conflict[],
  ignoredIds: readonly string[],
): { active: Conflict[]; ignored: Conflict[] } {
  const ignoredSet = new Set(ignoredIds);
  const active: Conflict[] = [];
  const ignored: Conflict[] = [];
  for (const c of conflicts) (ignoredSet.has(c.id) ? ignored : active).push(c);
  return { active, ignored };
}
