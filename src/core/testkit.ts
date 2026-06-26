/**
 * Fabriques compactes pour les tests du moteur. Hors couverture (outillage).
 * Repère temporel : juin 2026 — le lundi 2026-06-01 ouvre une grille simple.
 */
import type {
  Assignment,
  Block,
  Project,
  Resource,
  Task,
  TeamFile,
} from './model/types';
import { FORMAT_VERSION } from './model/types';

export function team(partial: Partial<TeamFile> = {}): TeamFile {
  return {
    formatVersion: FORMAT_VERSION,
    app: 'CrewGantt',
    team: { name: 'Test', calendar: { workingDays: [1, 2, 3, 4, 5], holidays: [] } },
    projects: [
      { id: 'pA', name: 'Projet A', color: '#4f8ef7', archived: false, notes: '' },
      { id: 'pB', name: 'Projet B', color: '#7bc47f', archived: false, notes: '' },
    ],
    resources: [],
    tasks: [],
    baselines: [],
    journal: [],
    ui: { zoom: 'week', projectFilter: null, collapsed: [], ignoredConflicts: [] },
    ...partial,
  };
}

export function person(id: string, partial: Partial<Resource> = {}): Resource {
  return { id, name: id, kind: 'person', exceptions: [], projectShares: [], ...partial };
}

export function project(id: string, partial: Partial<Project> = {}): Project {
  return { id, name: id, color: '#888888', archived: false, notes: '', ...partial };
}

export function task(id: string, partial: Partial<Task> = {}): Task {
  return {
    id,
    projectId: 'pA',
    parentId: null,
    order: 0,
    name: id,
    description: '',
    type: 'task',
    scheduling: 'effort',
    estimate: null,
    effort: 0,
    remaining: 0,
    progress: 0,
    status: 'todo',
    requirements: '',
    links: [],
    deadline: null,
    date: null,
    blocks: [],
    notes: [],
    ...partial,
  };
}

export function group(id: string, partial: Partial<Task> = {}): Task {
  return task(id, { type: 'group', ...partial });
}

export function milestone(id: string, date: string, partial: Partial<Task> = {}): Task {
  return task(id, { type: 'milestone', date, ...partial });
}

export function block(
  id: string,
  from: string,
  to: string | null,
  assignments: Assignment[] = [],
): Block {
  return { id, from, to, assignments };
}

export function assign(resourceId: string, units = 100): Assignment {
  return { resourceId, units };
}
