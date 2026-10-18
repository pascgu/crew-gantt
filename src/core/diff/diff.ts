import { diffDays } from '../calendar/dates';
import type {
  Assignment,
  CalendarException,
  IsoDate,
  MeetingSnapshot,
  MeetingTaskSnapshot,
  ProjectShare,
  Task,
  TeamFile,
} from '../model/types';
import { archivedProjectIds, isCountedTask } from '../model/visibility';
import { remainingOf, scheduledEffort } from '../scheduler/blocks';
import { computeSchedule, type Schedule } from '../scheduler/schedule';

/**
 * Résumé des réunions — pur, sans dépendance UI.
 *
 * À chaque clôture, l'entrée de journal mémorise un **instantané compact** du plan (par tâche :
 * statut, effort, reste, début/fin, équipe, nombre de notes ; par ressource : absences et parts
 * projet). La réunion suivante se compare à cet instantané : le résumé ne dépend donc ni de la
 * session (rechargement, onglet ouvert tard), ni de l'ordre des gestes.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

const exceptionKey = (ex: CalendarException) => `${ex.from}|${ex.to ?? ex.from}|${ex.percent}`;
const shareKey = (s: ProjectShare) => `${s.projectId}|${s.from}|${s.to ?? ''}|${s.percent}`;
const teamKey = (team: readonly Assignment[]) =>
  team
    .map((a) => `${a.resourceId}:${a.units}`)
    .sort()
    .join(',');

/** Instantané du plan tel que calculé (restes vus à la date du calcul — cf. fileAsOf). */
export function buildMeetingSnapshot(schedule: Schedule): MeetingSnapshot {
  const { ctx } = schedule;
  const tasks: Record<string, MeetingTaskSnapshot> = {};
  for (const task of ctx.file.tasks) {
    if (task.type === 'group') continue;
    const span = schedule.spanByTask.get(task.id) ?? null;
    const resolved = [...(schedule.resolvedByTask.get(task.id) ?? [])].sort((a, b) =>
      a.from.localeCompare(b.from),
    );
    const isTask = task.type === 'task';
    tasks[task.id] = {
      name: task.name,
      type: isTask ? 'task' : 'milestone',
      status: task.status,
      effort: isTask
        ? round2(task.scheduling === 'effort' ? task.effort : scheduledEffort(ctx, task, resolved))
        : 0,
      remaining: isTask ? round2(remainingOf(ctx, task, resolved)) : 0,
      start: span?.start ?? null,
      end: span?.end ?? null,
      team: (resolved[resolved.length - 1]?.block.assignments ?? []).map((a) => ({ ...a })),
      notes: task.notes.length,
    };
  }
  const resources: MeetingSnapshot['resources'] = {};
  for (const r of ctx.file.resources) {
    resources[r.id] = {
      name: r.name,
      exceptions: r.exceptions.map(exceptionKey),
      shares: r.projectShares.map(shareKey),
    };
  }
  return { tasks, resources };
}

/** Instantané d'un fichier à une date (repli quand aucune réunion close n'en porte). */
export function snapshotOf(file: TeamFile, today: IsoDate): MeetingSnapshot {
  return buildMeetingSnapshot(computeSchedule(file, today));
}

export interface ProgressSince {
  /** Tâches passées « terminée » depuis l'instantané. */
  done: Set<string>;
  /** Tâches dont la fin a reculé, avec le recul en jours calendaires. */
  postponed: Map<string, number>;
}

/** Ce qui a avancé / glissé depuis l'instantané — alimente les groupes de l'écran Réunion. */
export function progressSince(prev: MeetingSnapshot, curr: MeetingSnapshot): ProgressSince {
  const done = new Set<string>();
  const postponed = new Map<string, number>();
  for (const [id, now] of Object.entries(curr.tasks)) {
    if (now.type !== 'task') continue;
    const before = prev.tasks[id];
    if (now.status === 'done') {
      if (before?.status !== 'done') done.add(id);
      continue;
    }
    if (now.status === 'cancelled' || !before?.end || !now.end) continue;
    const delta = diffDays(before.end, now.end);
    if (delta > 0) postponed.set(id, delta);
  }
  return { done, postponed };
}

const STATUS_LABEL: Record<Task['status'], string> = {
  todo: 'à faire',
  in_progress: 'en cours',
  done: 'terminée',
  blocked: 'bloquée',
  cancelled: 'annulée',
};

/**
 * Résumé en clair de tout ce qui a changé depuis l'instantané `prev` (réunion précédente) jusqu'au
 * plan courant `schedule` : créées, supprimées, statuts, restes et efforts, reportées / avancées,
 * planifiées, réaffectées, notes, absences et parts projet.
 */
export function summarizeSince(prev: MeetingSnapshot, schedule: Schedule): string[] {
  const { file } = schedule.ctx;
  const curr = buildMeetingSnapshot(schedule);
  const lines: string[] = [];
  const resourceName = (id: string) =>
    file.resources.find((r) => r.id === id)?.name ?? prev.resources[id]?.name ?? id;

  for (const task of file.tasks) {
    if (task.type === 'group') continue;
    const now = curr.tasks[task.id]!;
    const before = prev.tasks[task.id];
    if (!before) {
      lines.push(`${task.name} : créée`);
      continue;
    }
    if (task.type === 'milestone') {
      if (now.start && before.start !== now.start) {
        const delta = before.start ? ` (${signed(diffDays(before.start, now.start))} j)` : '';
        lines.push(`${task.name} : jalon déplacé au ${frDate(now.start)}${delta}`);
      }
      continue;
    }
    if (before.status !== now.status) lines.push(`${task.name} : ${STATUS_LABEL[now.status]}`);
    if (task.scheduling === 'effort') {
      if (Math.abs(before.remaining - now.remaining) > 0.005 && now.status !== 'done') {
        lines.push(`${task.name} : reste ${fmt(now.remaining)} j-h (était ${fmt(before.remaining)})`);
      }
      if (Math.abs(before.effort - now.effort) > 0.005) {
        lines.push(`${task.name} : effort ${fmt(now.effort)} j-h (était ${fmt(before.effort)})`);
      }
    }
    if (!before.end && now.start && now.end) {
      lines.push(`${task.name} : planifiée du ${frDate(now.start)} au ${frDate(now.end)}`);
    } else if (before.end && now.end && now.status !== 'done' && now.status !== 'cancelled') {
      const delta = diffDays(before.end, now.end);
      if (delta > 0) lines.push(`${task.name} : reportée de ${delta} j (fin le ${frDate(now.end)})`);
      else if (delta < 0) lines.push(`${task.name} : avancée de ${-delta} j (fin le ${frDate(now.end)})`);
    }
    if (teamKey(before.team) !== teamKey(now.team) && now.team.length + before.team.length > 0) {
      const oldNames = before.team.map((a) => resourceName(a.resourceId)).join(', ') || '—';
      const newNames = now.team.map((a) => `${resourceName(a.resourceId)} (${a.units} %)`).join(', ') || '—';
      const lastFrom = [...task.blocks].sort((a, b) => a.from.localeCompare(b.from)).at(-1)?.from;
      lines.push(`${task.name} : ${oldNames} → ${newNames}${lastFrom ? ` à partir du ${frDate(lastFrom)}` : ''}`);
    }
    for (const note of task.notes.slice(before.notes)) {
      lines.push(`${task.name} : note — ${note.text}`);
    }
  }

  for (const [id, before] of Object.entries(prev.tasks)) {
    if (!curr.tasks[id]) lines.push(`${before.name} : supprimée`);
  }

  // Disponibilités et parts projet
  for (const resource of file.resources) {
    const before = prev.resources[resource.id];
    if (!before) {
      lines.push(`${resource.name} : ajouté(e) à l'équipe`);
      continue;
    }
    const knownEx = new Set(before.exceptions);
    for (const ex of resource.exceptions) {
      if (knownEx.has(exceptionKey(ex))) continue;
      const range = ex.to && ex.to !== ex.from ? `du ${frDate(ex.from)} au ${frDate(ex.to)}` : `le ${frDate(ex.from)}`;
      lines.push(`${resource.name} : ${ex.percent} % ${range}${ex.reason ? ` (${ex.reason})` : ''}`);
    }
    const knownShares = new Set(before.shares);
    for (const share of resource.projectShares) {
      if (knownShares.has(shareKey(share))) continue;
      const project = file.projects.find((p) => p.id === share.projectId)?.name ?? share.projectId;
      lines.push(`${resource.name} : ${share.percent} % sur ${project} à partir du ${frDate(share.from)}`);
    }
  }

  return lines;
}

/** Résumé entre deux états de fichier, vus à la même date. */
export function summarizeChanges(before: TeamFile, after: TeamFile, today: IsoDate): string[] {
  return summarizeSince(snapshotOf(before, today), computeSchedule(after, today));
}

function frDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function fmt(n: number): string {
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

/**
 * Σ des restes à faire des tâches qui comptent (ni annulées, ni d'un projet archivé) — un point
 * de burndown. Sur un `schedule`, ce sont les restes vus à sa date (date de réunion).
 */
export function totalRemaining(file: TeamFile): number {
  const archived = archivedProjectIds(file);
  let total = 0;
  for (const task of file.tasks) {
    if (task.type === 'task' && isCountedTask(task, archived)) total += task.remaining;
  }
  return Math.round(total * 10) / 10;
}
