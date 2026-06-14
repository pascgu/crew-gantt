import { describe, expect, it } from 'vitest';
import { createCalcContext } from './context';
import {
  closedBlockCapacity,
  effortCapacityOnDay,
  remainingForEndDate,
  resolveBlocks,
  taskSpan,
} from './blocks';
import { assign, block, person, task, team } from '../testkit';

function ctxWith(resources = [person('alice')], holidays: string[] = [], today = '2026-06-01') {
  const file = team({ resources });
  file.team.calendar.holidays = holidays;
  return createCalcContext(file, today);
}

describe('bloc ouvert en mode effort — la fin absorbe le reste à faire', () => {
  it('plein temps : 5 j-h → lundi à vendredi', () => {
    const t = task('t', {
      remaining: 5,
      effort: 5,
      blocks: [block('b', '2026-06-01', null, [assign('alice')])],
    });
    const [r] = resolveBlocks(ctxWith(), t);
    expect(r!.to).toBe('2026-06-05');
    expect(r!.computed).toBe(true);
    expect(r!.overflow).toBe(false);
  });

  it('enjambe le week-end : 6 j-h → fin lundi suivant', () => {
    const t = task('t', {
      remaining: 6,
      effort: 6,
      blocks: [block('b', '2026-06-01', null, [assign('alice')])],
    });
    expect(resolveBlocks(ctxWith(), t)[0]!.to).toBe('2026-06-08');
  });

  it('à 50 % (units) : 2 fois plus long', () => {
    const t = task('t', {
      remaining: 5,
      blocks: [block('b', '2026-06-01', null, [assign('alice', 50)])],
    });
    expect(resolveBlocks(ctxWith(), t)[0]!.to).toBe('2026-06-12');
  });

  it('la part projet réduit la capacité', () => {
    const alice = person('alice', {
      projectShares: [{ projectId: 'pA', from: '2026-01-01', percent: 50 }],
    });
    const t = task('t', {
      remaining: 2.5,
      blocks: [block('b', '2026-06-01', null, [assign('alice')])],
    });
    expect(resolveBlocks(ctxWith([alice]), t)[0]!.to).toBe('2026-06-05');
  });

  it('un férié rallonge', () => {
    const t = task('t', {
      remaining: 5,
      blocks: [block('b', '2026-06-01', null, [assign('alice')])],
    });
    expect(resolveBlocks(ctxWith([person('alice')], ['2026-06-03']), t)[0]!.to).toBe('2026-06-08');
  });

  it('une absence datée rallonge', () => {
    const alice = person('alice', {
      exceptions: [{ from: '2026-06-03', to: '2026-06-04', percent: 0 }],
    });
    const t = task('t', {
      remaining: 5,
      blocks: [block('b', '2026-06-01', null, [assign('alice')])],
    });
    expect(resolveBlocks(ctxWith([alice]), t)[0]!.to).toBe('2026-06-09');
  });

  it('une demi-journée compte pour 0,5', () => {
    const alice = person('alice', { exceptions: [{ from: '2026-06-02', percent: 50 }] });
    const t = task('t', {
      remaining: 2,
      blocks: [block('b', '2026-06-01', null, [assign('alice')])],
    });
    // lun 1, mar 0,5, mer 1 → cumul 2,5 ≥ 2 le mercredi
    expect(resolveBlocks(ctxWith([alice]), t)[0]!.to).toBe('2026-06-03');
  });

  it('deux affectations cumulent leurs capacités', () => {
    const t = task('t', {
      remaining: 4,
      blocks: [block('b', '2026-06-01', null, [assign('alice'), assign('bob')])],
    });
    expect(resolveBlocks(ctxWith([person('alice'), person('bob')]), t)[0]!.to).toBe('2026-06-02');
  });

  it('reste 0 : le bloc se réduit à son premier jour', () => {
    const t = task('t', {
      remaining: 0,
      blocks: [block('b', '2026-06-01', null, [assign('alice')])],
    });
    const [r] = resolveBlocks(ctxWith(), t);
    expect(r!.to).toBe('2026-06-01');
    expect(r!.overflow).toBe(false);
  });

  it('sans affectation : 1 j-h / jour ouvré → lundi à vendredi', () => {
    const t = task('t', { remaining: 5, blocks: [block('b', '2026-06-01', null)] });
    const [r] = resolveBlocks(ctxWith(), t);
    expect(r!.overflow).toBe(false);
    expect(r!.to).toBe('2026-06-05');
  });

  it("affecté à quelqu'un qui n'a aucune capacité : overflow", () => {
    const alice = person('alice', {
      projectShares: [{ projectId: 'pA', from: '2026-01-01', percent: 0 }],
    });
    const t = task('t', {
      remaining: 5,
      blocks: [block('b', '2026-06-01', null, [assign('alice')])],
    });
    expect(resolveBlocks(ctxWith([alice]), t)[0]!.overflow).toBe(true);
  });
});

describe('blocs fermés et mode fixed', () => {
  it('un bloc fermé passé est de l’historique : déjà déduit du reste', () => {
    const t = task('t', {
      remaining: 7,
      blocks: [
        block('b1', '2026-06-01', '2026-06-02', [assign('alice')]),
        block('b2', '2026-06-15', null, [assign('alice')]),
      ],
    });
    // today = 08/06 : b1 est du passé, le bloc ouvert absorbe les 7 j-h entiers
    const resolved = resolveBlocks(ctxWith([person('alice')], [], '2026-06-08'), t);
    expect(resolved[0]).toMatchObject({ from: '2026-06-01', to: '2026-06-02', computed: false });
    expect(resolved[1]).toMatchObject({ from: '2026-06-15', to: '2026-06-23', computed: true });
  });

  it('un bloc fermé à venir (découpage volontaire) consomme une part du reste', () => {
    const t = task('t', {
      remaining: 7,
      blocks: [
        block('b1', '2026-06-08', '2026-06-09', [assign('alice')]),
        block('b2', '2026-06-15', null, [assign('alice')]),
      ],
    });
    // today = 01/06 : b1 (2 j-h à venir) sera fait — le bloc ouvert n'absorbe que 5 j-h
    const resolved = resolveBlocks(ctxWith(), t);
    expect(resolved[1]).toMatchObject({ from: '2026-06-15', to: '2026-06-19', computed: true });
  });

  it('un bloc fermé à cheval sur today ne compte que ses jours à venir', () => {
    const t = task('t', {
      remaining: 6,
      blocks: [
        block('b1', '2026-06-01', '2026-06-05', [assign('alice')]),
        block('b2', '2026-06-15', null, [assign('alice')]),
      ],
    });
    // today = 04/06 : b1 apporte encore jeudi 04 + vendredi 05 = 2 j-h → reste 4 pour b2
    const resolved = resolveBlocks(ctxWith([person('alice')], [], '2026-06-04'), t);
    expect(resolved[1]).toMatchObject({ from: '2026-06-15', to: '2026-06-18' });
  });

  it('en mode fixed, un bloc ouvert se réduit à sa date de début', () => {
    const t = task('t', {
      scheduling: 'fixed',
      remaining: 10,
      blocks: [block('b', '2026-06-01', null, [assign('alice')])],
    });
    expect(resolveBlocks(ctxWith(), t)[0]!.to).toBe('2026-06-01');
  });

  it('closedBlockCapacity somme les capacités du bloc', () => {
    const ctx = ctxWith();
    const t = task('t', {
      blocks: [block('b', '2026-06-01', '2026-06-08', [assign('alice', 50)])],
    });
    const [r] = resolveBlocks(ctx, t);
    // 6 jours ouvrés (lun–ven + lun) × 0,5
    expect(closedBlockCapacity(ctx, t, r!)).toBeCloseTo(3, 10);
  });
});

describe('effortCapacityOnDay', () => {
  it('bloc affecté : délègue à blockCapacityOnDay', () => {
    const ctx = ctxWith();
    const t = task('t', { blocks: [block('b', '2026-06-01', null, [assign('alice')])] });
    expect(effortCapacityOnDay(ctx, t, t.blocks[0]!, '2026-06-01')).toBeCloseTo(1);
    expect(effortCapacityOnDay(ctx, t, t.blocks[0]!, '2026-06-06')).toBe(0); // week-end
  });

  it('bloc sans affectation : 1 j-h sur jour ouvré, 0 le week-end', () => {
    const ctx = ctxWith();
    const t = task('t', { blocks: [block('b', '2026-06-01', null)] });
    expect(effortCapacityOnDay(ctx, t, t.blocks[0]!, '2026-06-01')).toBe(1); // lundi
    expect(effortCapacityOnDay(ctx, t, t.blocks[0]!, '2026-06-06')).toBe(0); // samedi
  });
});

describe('remainingForEndDate', () => {
  it('sans affectation : fin tirée à +4 j ouvrés → Reste = 4', () => {
    const ctx = ctxWith();
    const t = task('t', {
      remaining: 1,
      blocks: [block('b', '2026-06-01', null)],
    });
    // Tirer la fin au vendredi 5 juin = 5 j-h (lun-ven)
    expect(remainingForEndDate(ctx, t, 'b', '2026-06-05')).toBe(5);
  });

  it('2 personnes à 100 % : fin à +2 j → Reste = 4', () => {
    const ctx = ctxWith([person('alice'), person('bob')]);
    const t = task('t', {
      remaining: 1,
      blocks: [block('b', '2026-06-01', null, [assign('alice'), assign('bob')])],
    });
    // 2 pers × 2 j = 4
    expect(remainingForEndDate(ctx, t, 'b', '2026-06-02')).toBe(4);
  });

  it('aller-retour : resolveBlocks re-place la fin exactement sur endDay', () => {
    const ctx = ctxWith();
    const t = task('t', {
      remaining: 1,
      blocks: [block('b', '2026-06-01', null)],
    });
    const endDay = '2026-06-05'; // vendredi
    const newRemaining = remainingForEndDate(ctx, t, 'b', endDay);
    const t2 = task('t', { remaining: newRemaining, blocks: [block('b', '2026-06-01', null)] });
    const [r] = resolveBlocks(ctx, t2);
    expect(r!.to).toBe(endDay);
  });
});

describe('taskSpan', () => {
  it('du début du premier bloc à la fin du dernier', () => {
    const ctx = ctxWith([person('alice')], [], '2026-06-08');
    const t = task('t', {
      remaining: 2,
      blocks: [
        block('b2', '2026-06-15', null, [assign('alice')]),
        block('b1', '2026-06-01', '2026-06-02', [assign('alice')]),
      ],
    });
    expect(taskSpan(resolveBlocks(ctx, t))).toEqual({ start: '2026-06-01', end: '2026-06-16' });
  });

  it('sans bloc : null', () => {
    expect(taskSpan([])).toBeNull();
  });
});
