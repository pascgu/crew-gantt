import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_COLUMN_ORDER, normalizeOrder, useTableStore, type ColKey } from './tableStore';

describe('normalizeOrder', () => {
  it('garde name en tête et complète les colonnes manquantes', () => {
    const out = normalizeOrder(['status', 'project']);
    expect(out[0]).toBe('name');
    // les clés fournies viennent d'abord (après name), puis le reste par défaut
    expect(out.slice(1, 3)).toEqual(['status', 'project']);
    // toutes les colonnes affichées sont présentes, sans doublon
    expect(new Set(out)).toEqual(new Set(DEFAULT_COLUMN_ORDER));
    expect(out.length).toBe(DEFAULT_COLUMN_ORDER.length);
  });

  it('ignore les clés inconnues ou dupliquées et un name mal placé', () => {
    const out = normalizeOrder(['bogus' as ColKey, 'effort', 'effort', 'name', 'group']);
    expect(out[0]).toBe('name');
    expect(out[1]).toBe('effort');
    expect(out.filter((k) => k === 'effort')).toHaveLength(1);
    expect(out).not.toContain('bogus');
    expect(out).not.toContain('group');
  });

  it('défaut sans argument', () => {
    expect(normalizeOrder()).toEqual(DEFAULT_COLUMN_ORDER);
  });
});

describe('moveColumn', () => {
  beforeEach(() => {
    useTableStore.setState({ order: [...DEFAULT_COLUMN_ORDER] });
  });

  it('déplace une colonne d’un cran et clampe aux bords', () => {
    const { moveColumn } = useTableStore.getState();
    // project (index 1) ne peut pas remonter avant name
    moveColumn('project', 'up');
    expect(useTableStore.getState().order[0]).toBe('name');
    expect(useTableStore.getState().order[1]).toBe('project');

    moveColumn('project', 'down'); // project <-> scheduling
    expect(useTableStore.getState().order.slice(1, 3)).toEqual(['scheduling', 'project']);
  });

  it('ne déplace jamais name', () => {
    const { moveColumn } = useTableStore.getState();
    moveColumn('name', 'down');
    expect(useTableStore.getState().order[0]).toBe('name');
  });

  it('la dernière colonne ne descend pas', () => {
    const { moveColumn } = useTableStore.getState();
    const last = DEFAULT_COLUMN_ORDER[DEFAULT_COLUMN_ORDER.length - 1]!;
    moveColumn(last, 'down');
    expect(useTableStore.getState().order[useTableStore.getState().order.length - 1]).toBe(last);
  });
});
