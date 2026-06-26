import { describe, expect, it } from 'vitest';
import { createCalcContext as createCalcContextRaw } from './context';
import { person, team } from '../testkit';
import type { TeamFile } from '../model/types';

// `today` n'influence ni la présence ni les parts : valeur fixe pour tous ces tests.
const createCalcContext = (file: TeamFile) => createCalcContextRaw(file, '2026-06-01');

// Juin 2026 : lundi 01, mardi 02, mercredi 03, jeudi 04, vendredi 05, samedi 06, dimanche 07…

describe('présence', () => {
  it('vaut 1 un jour ouvré, 0 le week-end', () => {
    const ctx = createCalcContext(team({ resources: [person('alice')] }));
    expect(ctx.presence('alice', '2026-06-01')).toBe(1);
    expect(ctx.presence('alice', '2026-06-06')).toBe(0); // samedi
    expect(ctx.presence('alice', '2026-06-07')).toBe(0); // dimanche
  });

  it('vaut 0 un férié global', () => {
    const file = team({ resources: [person('alice')] });
    file.team.calendar.holidays = ['2026-06-03'];
    const ctx = createCalcContext(file);
    expect(ctx.presence('alice', '2026-06-03')).toBe(0);
  });

  it('respecte le motif hebdo personnel (pas le mercredi)', () => {
    const ctx = createCalcContext(
      team({ resources: [person('alice', { workingDays: [1, 2, 4, 5] })] }),
    );
    expect(ctx.presence('alice', '2026-06-03')).toBe(0); // mercredi
    expect(ctx.presence('alice', '2026-06-04')).toBe(1);
  });

  it("l'exception datée prime sur tout", () => {
    const file = team({
      resources: [
        person('alice', {
          workingDays: [1, 2, 4, 5],
          exceptions: [
            { from: '2026-06-08', to: '2026-06-12', percent: 0, reason: 'Congés' },
            { from: '2026-06-02', percent: 50 },
            { from: '2026-06-06', percent: 100, reason: 'Samedi travaillé' },
            { from: '2026-06-17', percent: 100, reason: 'Mercredi travaillé' },
            { from: '2026-06-25', percent: 100, reason: 'Férié travaillé' },
          ],
        }),
      ],
    });
    file.team.calendar.holidays = ['2026-06-25'];
    const ctx = createCalcContext(file);
    expect(ctx.presence('alice', '2026-06-10')).toBe(0); // congés (plage)
    expect(ctx.presence('alice', '2026-06-02')).toBe(0.5); // demi-journée (1 seul jour)
    expect(ctx.presence('alice', '2026-06-06')).toBe(1); // samedi normalement chômé mais travaillé
    expect(ctx.presence('alice', '2026-06-17')).toBe(1); // mercredi hors motif mais travaillé
    expect(ctx.presence('alice', '2026-06-25')).toBe(1); // exception > férié global
  });

  it("la dernière exception couvrante l'emporte", () => {
    const ctx = createCalcContext(
      team({
        resources: [
          person('alice', {
            exceptions: [
              { from: '2026-06-01', to: '2026-06-05', percent: 0 },
              { from: '2026-06-03', percent: 50 },
            ],
          }),
        ],
      }),
    );
    expect(ctx.presence('alice', '2026-06-02')).toBe(0);
    expect(ctx.presence('alice', '2026-06-03')).toBe(0.5);
  });

  it('ressource inconnue : présence 0', () => {
    const ctx = createCalcContext(team());
    expect(ctx.presence('fantome', '2026-06-01')).toBe(0);
  });
});

describe('parts projet', () => {
  it('sans entrée : 100 %', () => {
    const ctx = createCalcContext(team({ resources: [person('bob')] }));
    expect(ctx.projectShare('bob', 'pA', '2026-06-01')).toBe(1);
  });

  it("la dernière entrée couvrant la date s'applique, projet par projet", () => {
    const ctx = createCalcContext(
      team({
        resources: [
          person('alice', {
            projectShares: [
              { projectId: 'pA', from: '2026-01-01', percent: 60 },
              { projectId: 'pB', from: '2026-01-01', percent: 40 },
              { projectId: 'pA', from: '2026-07-01', percent: 100 },
              { projectId: 'pB', from: '2026-07-01', percent: 0 },
            ],
          }),
        ],
      }),
    );
    expect(ctx.projectShare('alice', 'pA', '2026-06-15')).toBe(0.6);
    expect(ctx.projectShare('alice', 'pB', '2026-06-15')).toBe(0.4);
    expect(ctx.projectShare('alice', 'pA', '2026-07-15')).toBe(1);
    expect(ctx.projectShare('alice', 'pB', '2026-07-15')).toBe(0);
    // Avant toute entrée : défaut 100 %
    expect(ctx.projectShare('alice', 'pA', '2025-12-31')).toBe(1);
  });

  it('respecte la borne de fin `to`', () => {
    const ctx = createCalcContext(
      team({
        resources: [
          person('alice', {
            projectShares: [{ projectId: 'pA', from: '2026-06-01', to: '2026-06-10', percent: 50 }],
          }),
        ],
      }),
    );
    expect(ctx.projectShare('alice', 'pA', '2026-06-10')).toBe(0.5);
    expect(ctx.projectShare('alice', 'pA', '2026-06-11')).toBe(1);
  });
});

describe('capacité d’une affectation', () => {
  it('= présence × part projet × units', () => {
    const ctx = createCalcContext(
      team({
        resources: [
          person('alice', {
            projectShares: [{ projectId: 'pA', from: '2026-01-01', percent: 60 }],
          }),
        ],
      }),
    );
    expect(ctx.assignmentCapacity('alice', 'pA', 80, '2026-06-01')).toBeCloseTo(0.48, 10);
    expect(ctx.assignmentCapacity('alice', 'pA', 80, '2026-06-06')).toBe(0); // samedi
  });
});

describe('arithmétique en jours ouvrés', () => {
  it('nextWorkingDay saute week-ends et fériés', () => {
    const file = team();
    file.team.calendar.holidays = ['2026-06-08'];
    const ctx = createCalcContext(file);
    expect(ctx.nextWorkingDay('2026-06-06')).toBe('2026-06-09'); // samedi → mardi (lundi férié)
    expect(ctx.nextWorkingDay('2026-06-02')).toBe('2026-06-02');
  });

  it('addWorkingDays avance, recule, et 0 = identité', () => {
    const ctx = createCalcContext(team());
    expect(ctx.addWorkingDays('2026-06-05', 1)).toBe('2026-06-08'); // vendredi +1 → lundi
    expect(ctx.addWorkingDays('2026-06-08', -1)).toBe('2026-06-05'); // lundi −1 → vendredi
    expect(ctx.addWorkingDays('2026-06-03', 0)).toBe('2026-06-03');
    expect(ctx.addWorkingDays('2026-06-01', 7)).toBe('2026-06-10');
  });

  it('addWorkingDays saute les fériés', () => {
    const file = team();
    file.team.calendar.holidays = ['2026-06-04'];
    const ctx = createCalcContext(file);
    expect(ctx.addWorkingDays('2026-06-03', 1)).toBe('2026-06-05');
  });
});
