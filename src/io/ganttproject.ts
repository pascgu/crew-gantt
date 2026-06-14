/**
 * Import / export compatible GanttProject 3.x (.gan XML).
 *
 * Pertes assumées à l'import :
 *  - blocs multiples par tâche (un seul bloc créé depuis start+duration)
 *  - exceptions de calendrier personnelles
 *  - parts projet par ressource
 *  - statut de tâche (remis à 'todo')
 *  - baselines
 *
 * À l'export, un seul projet est utilisé (la couleur du projet de la tâche
 * racine, ou la première couleur rencontrée).
 */

import { addDays, diffDays } from '@/core/calendar/dates';
import {
  createBlock,
  createEmptyTeamFile,
  createProject,
  createResource,
  createTask,
} from '@/core/model/factory';
import type { IsoDate, TeamFile, Weekday } from '@/core/model/types';
import type { Schedule } from '@/core/scheduler/schedule';

// ——— Utilitaires XML ———

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ——— EXPORT ———

/**
 * Sérialise un TeamFile + son schedule en XML GanttProject 3.x.
 * Retourne une chaîne UTF-8 prête à être téléchargée.
 */
export function exportGanttProjectXml(file: TeamFile, schedule: Schedule): string {
  // Table id interne → id entier GanttProject
  const idMap = new Map<string, number>();
  let nextGpId = 1;
  const gpId = (id: string): number => {
    if (!idMap.has(id)) idMap.set(id, nextGpId++);
    return idMap.get(id)!;
  };

  // Calendrier
  const wd = file.team.calendar.workingDays;
  // GanttProject default-week: index 0=dim … 6=sam ; "0"=ouvré, "1"=chômé
  const GP_DOW = [7, 1, 2, 3, 4, 5, 6]; // ISO → GP index
  const dowAttrs = GP_DOW.map((isoDay) => (wd.includes(isoDay as Weekday) ? '0' : '1'));
  const weekAttr = `sun="${dowAttrs[0]}" mon="${dowAttrs[1]}" tue="${dowAttrs[2]}" wed="${dowAttrs[3]}" thu="${dowAttrs[4]}" fri="${dowAttrs[5]}" sat="${dowAttrs[6]}"`;

  const holidays = file.team.calendar.holidays
    .map((iso) => {
      const y = iso.slice(0, 4);
      const m = Number(iso.slice(5, 7));
      const d = Number(iso.slice(8, 10));
      return `    <date year="${y}" month="${m}" date="${d}" type="HOLIDAY"/>`;
    })
    .join('\n');

  // ——— Tâches : rendu récursif ———
  const rootTasks = (schedule.hierarchy.children.get(null) ?? []).map((t) => t.id);

  function renderTask(taskId: string, indent: string): string {
    const task = file.tasks.find((t) => t.id === taskId);
    if (!task) return '';
    const gid = gpId(taskId);
    const color = file.projects.find((p) => p.id === task.projectId)?.color ?? '#4f8ef7';
    const gpColor = color.replace('#', '');

    const children = (schedule.hierarchy.children.get(taskId) ?? []).map((t) => t.id);

    let attrs = `id="${gid}" name="${esc(task.name)}" color="${gpColor}" expand="true"`;

    if (task.type === 'milestone') {
      const date = task.date ?? schedule.spanByTask.get(taskId)?.start ?? '';
      attrs += ` meeting="true" duration="0" start="${date}"`;
      return `${indent}<task ${attrs}/>\n`;
    }

    const span = schedule.spanByTask.get(taskId);
    if (!span) {
      attrs += ` meeting="false" duration="0" start="${new Date().toISOString().slice(0, 10)}" complete="0"`;
    } else {
      const duration = diffDays(span.start, span.end) + 1;
      const complete =
        task.type === 'task' && task.effort > 0
          ? Math.round(((task.effort - task.remaining) / task.effort) * 100)
          : 0;
      attrs += ` meeting="false" start="${span.start}" duration="${duration}" complete="${complete}"`;
    }

    // Dépendances : émises dans le prédécesseur, pointer vers le successeur
    const depends = file.tasks
      .filter((t) => t.links.some((l) => l.on === taskId))
      .map((t) => {
        const link = t.links.find((l) => l.on === taskId)!;
        const type = link.type === 'with-start' ? 1 : 2;
        return `${indent}  <depend id="${gpId(t.id)}" type="${type}" difference="${link.lag}" hardness="Strong"/>`;
      });

    if (children.length === 0 && depends.length === 0) {
      return `${indent}<task ${attrs}/>\n`;
    }

    const inner = [
      ...depends,
      ...children.map((cid) => renderTask(cid, indent + '  ')),
    ].join('');

    return `${indent}<task ${attrs}>\n${inner}${indent}</task>\n`;
  }

  const tasksXml = rootTasks.map((id) => renderTask(id, '    ')).join('');

  // ——— Ressources ———
  const resourcesXml = file.resources
    .filter((r) => r.kind === 'person')
    .map((r) => `    <resource id="${gpId(r.id)}" name="${esc(r.name)}" function="Default:1"/>`)
    .join('\n');

  // ——— Affectations : (taskId, resourceId) → load agrégé ———
  const allocMap = new Map<string, number>();
  for (const task of file.tasks) {
    const resolved = schedule.resolvedByTask.get(task.id) ?? [];
    const lastBlock = resolved[resolved.length - 1]?.block;
    if (!lastBlock) continue;
    for (const a of lastBlock.assignments) {
      const key = `${task.id}::${a.resourceId}`;
      allocMap.set(key, Math.max(allocMap.get(key) ?? 0, a.units));
    }
  }

  const allocsXml = [...allocMap.entries()]
    .map(([key, load]) => {
      const [taskId, resourceId] = key.split('::') as [string, string];
      return `    <allocation task-id="${gpId(taskId)}" resource-id="${gpId(resourceId)}" function="Default:1" responsible="true" load="${load}"/>`;
    })
    .join('\n');

  const teamName = esc(file.team.name || 'CrewGantt');

  return `<?xml version="1.0" encoding="UTF-8"?>
<project name="${teamName}" company="" webLink="" view-date="${new Date().toISOString().slice(0, 10)}" view-index="0" gantt-divider-location="300" resource-divider-location="300" version="3.3" locale="fr">
  <description/>
  <view zooming-state="default:7" id="gantt-chart"/>
  <view id="resource-table"/>
  <calendars>
    <day-types>
      <day-type id="0"/>
      <day-type id="1"/>
      <default-week id="1" name="default" ${weekAttr}/>
      <only-show-weekends value="false"/>
      <overriden-day-types/>
      <days>
${holidays}
      </days>
    </day-types>
  </calendars>
  <tasks empty-milestones="true">
${tasksXml}  </tasks>
  <resources>
${resourcesXml}
  </resources>
  <allocations>
${allocsXml}
  </allocations>
  <vacations/>
  <previous/>
  <roles roleset-name="Default"/>
</project>
`;
}

// ——— IMPORT ———

/** Convertit un XML GanttProject en TeamFile (sans schedule). */
export function importGanttProjectXml(xml: string): TeamFile {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const root = doc.documentElement;

  if (root.nodeName === 'parsererror' || root.tagName !== 'project') {
    throw new Error('Invalid GanttProject XML');
  }

  const teamName = root.getAttribute('name') ?? 'Importé';
  const file = createEmptyTeamFile(teamName);

  // ——— Calendrier ———
  const defaultWeek = doc.querySelector('default-week');
  if (defaultWeek) {
    const GP_ATTRS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const ISO_DAYS = [7, 1, 2, 3, 4, 5, 6] as Weekday[];
    const working: Weekday[] = [];
    for (let i = 0; i < 7; i++) {
      if (defaultWeek.getAttribute(GP_ATTRS[i]!) === '0') {
        working.push(ISO_DAYS[i]!);
      }
    }
    if (working.length > 0) file.team.calendar.workingDays = working;
  }

  const dayEls = doc.querySelectorAll('calendars days date');
  for (const el of Array.from(dayEls)) {
    if (el.getAttribute('type') !== 'HOLIDAY') continue;
    const y = el.getAttribute('year') ?? '';
    const m = String(el.getAttribute('month') ?? '1').padStart(2, '0');
    const d = String(el.getAttribute('date') ?? '1').padStart(2, '0');
    const iso: IsoDate = `${y}-${m}-${d}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) file.team.calendar.holidays.push(iso);
  }

  // ——— Projet par défaut ———
  const defaultProject = createProject({ name: teamName, color: '#4f8ef7' });
  file.projects.push(defaultProject);

  // Table id GanttProject (string) → id interne
  const gpToInternalTask = new Map<string, string>();
  const gpToInternalResource = new Map<string, string>();

  // ——— Ressources ———
  const resourceEls = doc.querySelectorAll('resources resource');
  for (const el of Array.from(resourceEls)) {
    const gpId = el.getAttribute('id') ?? '';
    const name = el.getAttribute('name') ?? 'Ressource';
    const res = createResource({ name });
    file.resources.push(res);
    gpToInternalResource.set(gpId, res.id);
  }

  // ——— Tâches (récursif) ———
  const depends: Array<{ successorId: string; predGpId: string; type: string; lag: number }> = [];

  function parseTask(el: Element, parentId: string | null, order: { v: number }): void {
    const gpId = el.getAttribute('id') ?? '';
    const name = el.getAttribute('name') ?? 'Tâche';
    const isMilestone = el.getAttribute('meeting') === 'true';
    const startAttr = el.getAttribute('start') ?? '';
    const durationAttr = el.getAttribute('duration') ?? '1';
    const completeAttr = el.getAttribute('complete') ?? '0';

    const childTaskEls = Array.from(el.children).filter((c) => c.tagName === 'task');
    const isGroup = !isMilestone && childTaskEls.length > 0;

    const complete = Number(completeAttr) / 100;
    const duration = Number(durationAttr) || 1;
    const effort = duration;
    const remaining = Math.round(effort * (1 - complete) * 100) / 100;

    const task = createTask({
      name,
      projectId: defaultProject.id,
      parentId,
      order: order.v++,
      type: isMilestone ? 'milestone' : isGroup ? 'group' : 'task',
      scheduling: 'fixed',
      effort,
      remaining,
      date: isMilestone ? (startAttr || null) : null,
    });

    if (!isMilestone && !isGroup && startAttr) {
      const to = addDays(startAttr, duration - 1);
      task.blocks.push(
        createBlock({ from: startAttr as IsoDate, to: to as IsoDate }),
      );
    }

    file.tasks.push(task);
    gpToInternalTask.set(gpId, task.id);

    // Dépendances : <depend> dans le prédécesseur, pointe vers le successeur
    const dependEls = Array.from(el.children).filter((c) => c.tagName === 'depend');
    for (const dep of dependEls) {
      const successorGpId = dep.getAttribute('id') ?? '';
      const type = dep.getAttribute('type') ?? '2';
      const lag = Number(dep.getAttribute('difference') ?? '0');
      depends.push({ successorId: successorGpId, predGpId: gpId, type, lag });
    }

    // Enfants
    for (const child of childTaskEls) {
      parseTask(child, task.id, order);
    }
  }

  const rootTaskEls = Array.from(doc.querySelectorAll('tasks > task'));
  const order = { v: 0 };
  for (const el of rootTaskEls) parseTask(el, null, order);

  // ——— Résoudre les dépendances ———
  for (const dep of depends) {
    const successorInternalId = gpToInternalTask.get(dep.successorId);
    const predInternalId = gpToInternalTask.get(dep.predGpId);
    if (!successorInternalId || !predInternalId) continue;
    const successor = file.tasks.find((t) => t.id === successorInternalId);
    if (!successor) continue;
    successor.links.push({
      on: predInternalId,
      type: dep.type === '1' ? 'with-start' : 'after-end',
      lag: dep.lag,
    });
  }

  // ——— Affectations ———
  const allocEls = doc.querySelectorAll('allocations allocation');
  for (const el of Array.from(allocEls)) {
    const taskGpId = el.getAttribute('task-id') ?? '';
    const resGpId = el.getAttribute('resource-id') ?? '';
    const load = Number(el.getAttribute('load') ?? '100');
    const taskId = gpToInternalTask.get(taskGpId);
    const resId = gpToInternalResource.get(resGpId);
    if (!taskId || !resId) continue;
    const task = file.tasks.find((t) => t.id === taskId);
    if (!task || task.blocks.length === 0) continue;
    task.blocks[0]!.assignments.push({ resourceId: resId, units: load });
  }

  return file;
}

/** Slug de nom de fichier basé sur le nom de l'équipe. */
export function ganttProjectSlug(teamName: string): string {
  return (
    teamName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'projet'
  );
}
