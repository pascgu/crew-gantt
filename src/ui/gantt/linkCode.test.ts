import { describe, expect, it } from 'vitest';
import type { TaskLink } from '@/core/model/types';
import { linkCode } from './linkCode';

const link = (over: Partial<TaskLink> & Pick<TaskLink, 'type'>): TaskLink => ({
  on: 'pred',
  lag: 0,
  ...over,
});

describe('linkCode', () => {
  it('after-end : FD sans délai, F1D avec délai positif (pas de « + », ancre sans chiffre)', () => {
    expect(linkCode(link({ type: 'after-end' }))).toBe('FD');
    expect(linkCode(link({ type: 'after-end', lag: 1 }))).toBe('F1D');
    expect(linkCode(link({ type: 'after-end', lag: -1 }))).toBe('F-1D');
  });

  it('with-start : DD sans délai, DD1 avec ancre côté successeur', () => {
    expect(linkCode(link({ type: 'with-start' }))).toBe('DD');
    expect(linkCode(link({ type: 'with-start', targetDays: 1 }))).toBe('DD1');
    expect(linkCode(link({ type: 'with-start', lag: 1 }))).toBe('D1D');
  });

  it('after-progress : « + » explicite pour un délai positif (P2+1D, pas P21D)', () => {
    expect(linkCode(link({ type: 'after-progress', progressDays: 2 }))).toBe('P2D');
    expect(linkCode(link({ type: 'after-progress', progressDays: 2, lag: 1 }))).toBe('P2+1D');
  });

  it('after-progress : délai négatif déjà désambiguïsé par le signe (P2-1D)', () => {
    expect(linkCode(link({ type: 'after-progress', progressDays: 2, lag: -1 }))).toBe('P2-1D');
  });

  it('combine ancre prédécesseur P, délai et ancre successeur (P1D3, P2+1D3)', () => {
    expect(linkCode(link({ type: 'after-progress', progressDays: 1, targetDays: 3 }))).toBe('P1D3');
    expect(linkCode(link({ type: 'after-progress', progressDays: 2, lag: 1, targetDays: 3 }))).toBe(
      'P2+1D3',
    );
  });
});
