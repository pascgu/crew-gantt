import { describe, expect, it } from 'vitest';
import { archivedProjectIds, isCountedTask, maskedTaskIds } from './visibility';
import { group, task, team } from '../testkit';

describe('visibilité : hors calculs vs hors vue', () => {
  it('annulée ou projet archivé = hors calculs', () => {
    const f = team();
    f.projects[1]!.archived = true;
    const archived = archivedProjectIds(f);
    expect(isCountedTask(task('a'), archived)).toBe(true);
    expect(isCountedTask(task('b', { status: 'cancelled' }), archived)).toBe(false);
    expect(isCountedTask(task('c', { projectId: 'pB' }), archived)).toBe(false);
  });

  it('masquer un groupe masque ses descendants', () => {
    const tasks = [
      group('g', { priority: 'hidden' }),
      task('child', { parentId: 'g' }),
      group('g2'),
      task('lone', { parentId: 'g2', priority: 'hidden' }),
      task('visible', { parentId: 'g2' }),
    ];
    expect([...maskedTaskIds(tasks)].sort()).toEqual(['child', 'g', 'lone']);
  });
});
