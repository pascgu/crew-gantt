import { describe, expect, it } from 'vitest';
import { buildHierarchy } from './hierarchy';
import { group, task } from '../testkit';

describe('buildHierarchy', () => {
  const tasks = [
    group('g1', { order: 0 }),
    task('t2', { parentId: 'g1', order: 1 }),
    task('t1', { parentId: 'g1', order: 0 }),
    group('g2', { parentId: 'g1', order: 2 }),
    task('t3', { parentId: 'g2', order: 0 }),
    task('racine', { order: 1 }),
  ];

  it('trie les enfants par order', () => {
    const h = buildHierarchy(tasks);
    expect(h.children.get('g1')!.map((t) => t.id)).toEqual(['t1', 't2', 'g2']);
    expect(h.children.get(null)!.map((t) => t.id)).toEqual(['g1', 'racine']);
  });

  it('descendantsOf est récursif et ordonné', () => {
    const h = buildHierarchy(tasks);
    expect(h.descendantsOf('g1').map((t) => t.id)).toEqual(['t1', 't2', 'g2', 't3']);
    expect(h.descendantsOf('t3')).toEqual([]);
  });

  it('depthOf compte depuis la racine', () => {
    const h = buildHierarchy(tasks);
    expect(h.depthOf('g1')).toBe(0);
    expect(h.depthOf('t1')).toBe(1);
    expect(h.depthOf('t3')).toBe(2);
  });

  it('flatten = parcours préfixe complet avec profondeurs', () => {
    const h = buildHierarchy(tasks);
    expect(h.flatten().map(({ task: t, depth }) => `${t.id}:${depth}`)).toEqual([
      'g1:0',
      't1:1',
      't2:1',
      'g2:1',
      't3:2',
      'racine:0',
    ]);
  });

  it('un parentId orphelin est traité comme racine', () => {
    const h = buildHierarchy([task('seule', { parentId: 'disparu' })]);
    expect(h.children.get(null)!.map((t) => t.id)).toEqual(['seule']);
    expect(h.depthOf('seule')).toBe(0);
  });
});
