import { describe, expect, it } from 'vitest';
import { computeSchedule } from './scheduler/schedule';
import { detectConflicts } from './conflicts/detect';
import { proposePlan } from './propose/propose';
import { addDays } from './calendar/dates';
import { assign, block, group, person, project, task, team } from './testkit';
import type { Task, TeamFile } from './model/types';

/** Équipe de stress : 30 personnes, 6 projets, 500 tâches liées, ~1 an de plan. */
function buildLargeTeam(): TeamFile {
  const projects = Array.from({ length: 6 }, (_, i) =>
    project(`p${i}`, { name: `Projet ${i}`, color: '#4f8ef7' }),
  );
  const resources = Array.from({ length: 30 }, (_, i) =>
    person(`r${i}`, {
      name: `Personne ${i}`,
      workingDays: i % 5 === 0 ? [1, 2, 4, 5] : undefined,
      exceptions:
        i % 3 === 0
          ? [{ from: addDays('2026-06-01', (i * 7) % 200, ), to: addDays('2026-06-01', ((i * 7) % 200) + 4), percent: 0 }]
          : [],
      projectShares: [
        { projectId: `p${i % 6}`, from: '2026-01-01', percent: 60 },
        { projectId: `p${(i + 1) % 6}`, from: '2026-01-01', percent: 40 },
      ],
    }),
  );

  const tasks: Task[] = [];
  let order = 0;
  for (let g = 0; g < 50; g++) {
    const projectId = `p${g % 6}`;
    tasks.push(group(`g${g}`, { projectId, order: order++ }));
    for (let i = 0; i < 9; i++) {
      const id = `t${g}-${i}`;
      const start = addDays('2026-06-01', ((g * 9 + i) * 2) % 320);
      tasks.push(
        task(id, {
          projectId,
          parentId: `g${g}`,
          order: i,
          effort: 5,
          remaining: 4,
          estimate: 5,
          links: i > 0 ? [{ on: `t${g}-${i - 1}`, type: 'after-end', lag: 0 }] : [],
          blocks: [
            block(`b${g}-${i}`, start, null, [
              assign(`r${(g * 9 + i) % 30}`, 100),
            ]),
          ],
        }),
      );
    }
  }
  return team({ projects, resources, tasks });
}

describe('performance — 500 tâches / 30 personnes', () => {
  it('recalcul complet (schedule + conflits) < 50 ms', () => {
    const file = buildLargeTeam();
    expect(file.tasks.length).toBeGreaterThanOrEqual(500);
    // échauffement (JIT)
    detectConflicts(computeSchedule(file, '2026-06-01'));
    const t0 = performance.now();
    const schedule = computeSchedule(file, '2026-06-01');
    detectConflicts(schedule);
    const elapsed = performance.now() - t0;
    console.info(`recalcul : ${elapsed.toFixed(1)} ms`);
    expect(elapsed).toBeLessThan(50);
  });

  it('proposition complète < 250 ms', () => {
    const file = buildLargeTeam();
    proposePlan(file, '2026-06-01');
    const t0 = performance.now();
    proposePlan(file, '2026-06-01');
    const elapsed = performance.now() - t0;
    console.info(`proposition : ${elapsed.toFixed(1)} ms`);
    expect(elapsed).toBeLessThan(250);
  });
});
