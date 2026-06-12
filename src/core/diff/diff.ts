import type { Block, Task, TeamFile } from '../model/types';

/**
 * Résumé en clair des changements entre deux états du fichier — alimente le
 * journal d'équipe à la clôture d'une réunion. Pur, sans dépendance UI.
 */
export function summarizeChanges(before: TeamFile, after: TeamFile): string[] {
  const lines: string[] = [];
  const beforeTasks = new Map(before.tasks.map((t) => [t.id, t]));
  const afterTasks = new Map(after.tasks.map((t) => [t.id, t]));
  const resourceName = (id: string) =>
    after.resources.find((r) => r.id === id)?.name ??
    before.resources.find((r) => r.id === id)?.name ??
    id;

  for (const task of after.tasks) {
    const old = beforeTasks.get(task.id);
    if (!old) {
      lines.push(`${task.name} : créée`);
      continue;
    }
    if (task.type !== 'task') {
      if (task.type === 'milestone' && old.date !== task.date && task.date) {
        lines.push(`${task.name} : jalon déplacé au ${frDate(task.date)}`);
      }
      continue;
    }
    if (old.remaining !== task.remaining) {
      lines.push(`${task.name} : reste ${fmt(task.remaining)} j-h (était ${fmt(old.remaining)})`);
    }
    if (old.effort !== task.effort) {
      lines.push(`${task.name} : effort ${fmt(task.effort)} j-h (était ${fmt(old.effort)})`);
    }
    if (old.status !== task.status) {
      const labels: Record<Task['status'], string> = {
        todo: 'à faire',
        in_progress: 'en cours',
        done: 'terminée',
        blocked: 'bloquée',
      };
      lines.push(`${task.name} : ${labels[task.status]}`);
    }
    const reassign = describeReassignment(old, task, resourceName);
    if (reassign) lines.push(`${task.name} : ${reassign}`);
    if (task.notes.length > old.notes.length) {
      const note = task.notes[task.notes.length - 1]!;
      lines.push(`${task.name} : note — ${note.text}`);
    }
  }

  for (const old of before.tasks) {
    if (!afterTasks.has(old.id)) lines.push(`${old.name} : supprimée`);
  }

  // Disponibilités et parts projet
  const beforeResources = new Map(before.resources.map((r) => [r.id, r]));
  for (const resource of after.resources) {
    const old = beforeResources.get(resource.id);
    if (!old) {
      lines.push(`${resource.name} : ajouté(e) à l'équipe`);
      continue;
    }
    for (const ex of resource.exceptions) {
      if (!old.exceptions.some((o) => o.from === ex.from && o.to === ex.to && o.percent === ex.percent)) {
        const range = ex.to && ex.to !== ex.from ? `du ${frDate(ex.from)} au ${frDate(ex.to)}` : `le ${frDate(ex.from)}`;
        lines.push(`${resource.name} : ${ex.percent} % ${range}${ex.reason ? ` (${ex.reason})` : ''}`);
      }
    }
    for (const share of resource.projectShares) {
      if (
        !old.projectShares.some(
          (o) => o.projectId === share.projectId && o.from === share.from && o.percent === share.percent,
        )
      ) {
        const project = after.projects.find((p) => p.id === share.projectId)?.name ?? share.projectId;
        lines.push(`${resource.name} : ${share.percent} % sur ${project} à partir du ${frDate(share.from)}`);
      }
    }
  }

  return lines;
}

/** « Bob → Alice (80 %) à partir du 21/09 » quand l'équipe d'une tâche change. */
function describeReassignment(
  old: Task,
  task: Task,
  resourceName: (id: string) => string,
): string | null {
  const lastOf = (blocks: Block[]): Block | undefined =>
    [...blocks].sort((a, b) => a.from.localeCompare(b.from))[blocks.length - 1];
  const oldLast = lastOf(old.blocks);
  const newLast = lastOf(task.blocks);
  if (!newLast) return null;
  const key = (b: Block | undefined) =>
    (b?.assignments ?? [])
      .map((a) => `${a.resourceId}:${a.units}`)
      .sort()
      .join(',');
  if (key(oldLast) === key(newLast)) return null;
  const oldNames = (oldLast?.assignments ?? []).map((a) => resourceName(a.resourceId)).join(', ') || '—';
  const newNames =
    newLast.assignments.map((a) => `${resourceName(a.resourceId)} (${a.units} %)`).join(', ') || '—';
  return `${oldNames} → ${newNames} à partir du ${frDate(newLast.from)}`;
}

function frDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function fmt(n: number): string {
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

/** Σ des restes à faire — un point de burndown par réunion close. */
export function totalRemaining(file: TeamFile): number {
  let total = 0;
  for (const task of file.tasks) {
    if (task.type === 'task') total += task.remaining;
  }
  return Math.round(total * 10) / 10;
}
