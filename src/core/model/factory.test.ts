import { describe, expect, it } from 'vitest';
import { createBlock, createProject, createResource, createTask, newId } from './factory';
import { serializeTeamFile } from './migrate';
import { createEmptyTeamFile } from './factory';

describe('fabriques', () => {
  it('newId préfixe et varie', () => {
    const a = newId('t');
    expect(a).toMatch(/^t-/);
    expect(newId('t')).not.toBe(a);
  });

  it('createTask remplit tous les défauts', () => {
    const t = createTask({ name: 'X', projectId: 'p1' });
    expect(t).toMatchObject({
      name: 'X',
      projectId: 'p1',
      parentId: null,
      type: 'task',
      scheduling: 'effort',
      effort: 0,
      remaining: 0,
      status: 'todo',
      links: [],
      blocks: [],
    });
  });

  it('createProject / createResource / createBlock', () => {
    expect(createProject({ name: 'P' })).toMatchObject({ name: 'P', archived: false });
    expect(createResource({ name: 'R' })).toMatchObject({ kind: 'person', exceptions: [] });
    expect(createBlock({ from: '2026-06-01' })).toMatchObject({ from: '2026-06-01', to: null });
  });

  it('un fichier construit aux fabriques se sérialise sans erreur', () => {
    const file = createEmptyTeamFile('Test');
    const project = createProject({ name: 'P' });
    file.projects.push(project);
    file.resources.push(createResource({ name: 'R' }));
    const t = createTask({ name: 'T', projectId: project.id });
    t.blocks.push(createBlock({ from: '2026-06-01' }));
    file.tasks.push(t);
    expect(() => serializeTeamFile(file)).not.toThrow();
  });
});
