import { nanoid } from 'nanoid';
import { FORMAT_VERSION } from './types';
import type { Block, Project, Resource, Task, TeamFile } from './types';

export function newId(prefix: string): string {
  return `${prefix}-${nanoid(8)}`;
}

export function createEmptyTeamFile(name: string): TeamFile {
  return {
    formatVersion: FORMAT_VERSION,
    app: 'CrewGantt',
    team: { name, calendar: { workingDays: [1, 2, 3, 4, 5], holidays: [] } },
    projects: [],
    resources: [],
    tasks: [],
    baselines: [],
    journal: [],
    ui: { zoom: 'week', projectFilter: null, collapsed: [], ignoredConflicts: [] },
  };
}

export function createProject(partial: Partial<Project> & Pick<Project, 'name'>): Project {
  return {
    id: newId('p'),
    color: '#4f8ef7',
    archived: false,
    notes: '',
    ...partial,
  };
}

export function createResource(partial: Partial<Resource> & Pick<Resource, 'name'>): Resource {
  return {
    id: newId('r'),
    kind: 'person',
    exceptions: [],
    projectShares: [],
    ...partial,
  };
}

export function createTask(
  partial: Partial<Task> & Pick<Task, 'name' | 'projectId'>,
): Task {
  return {
    id: newId('t'),
    parentId: null,
    order: 0,
    description: '',
    type: 'task',
    scheduling: 'effort',
    estimate: null,
    effort: 0,
    remaining: 0,
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

export function createBlock(partial: Partial<Block> & Pick<Block, 'from'>): Block {
  return {
    id: newId('b'),
    to: null,
    assignments: [],
    ...partial,
  };
}
