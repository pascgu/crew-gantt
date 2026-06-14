// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { exportGanttProjectXml, importGanttProjectXml } from './ganttproject';
import { createEmptyTeamFile, createProject, createTask, createBlock, createResource } from '@/core/model/factory';
import { computeSchedule } from '@/core/scheduler/schedule';

function makeMinimalFile() {
  const file = createEmptyTeamFile('TestEquipe');
  const proj = createProject({ name: 'Projet A', color: '#ff0000' });
  file.projects.push(proj);

  const res = createResource({ name: 'Alice' });
  file.resources.push(res);

  const task1 = createTask({
    name: 'Conception',
    projectId: proj.id,
    effort: 5,
    remaining: 2,
    scheduling: 'fixed',
  });
  task1.blocks.push(createBlock({ from: '2025-01-06', to: '2025-01-10' }));
  file.tasks.push(task1);

  const task2 = createTask({
    name: 'Développement',
    projectId: proj.id,
    effort: 10,
    remaining: 10,
    scheduling: 'fixed',
  });
  task2.blocks.push(createBlock({ from: '2025-01-13', to: '2025-01-24' }));
  task2.links.push({ on: task1.id, type: 'after-end', lag: 0 });
  task2.blocks[0]!.assignments.push({ resourceId: res.id, units: 100 });
  file.tasks.push(task2);

  const milestone = createTask({
    name: 'Livraison',
    projectId: proj.id,
    type: 'milestone',
    date: '2025-01-31',
    effort: 0,
    remaining: 0,
    scheduling: 'fixed',
  });
  file.tasks.push(milestone);

  file.team.calendar.holidays.push('2025-01-01');

  return { file, proj, res, task1, task2, milestone };
}

describe('GanttProject import/export', () => {
  it('exporte un XML valide', () => {
    const { file } = makeMinimalFile();
    const schedule = computeSchedule(file, '2025-01-06');
    const xml = exportGanttProjectXml(file, schedule);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<project name="TestEquipe"');
    expect(xml).toContain('Conception');
    expect(xml).toContain('Développement');
    expect(xml).toContain('meeting="true"'); // milestone
    expect(xml).toContain('type="HOLIDAY"'); // 2025-01-01
  });

  it('importe un XML GanttProject minimal', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<project name="MonProjet" version="3.3">
  <calendars>
    <day-types>
      <default-week id="1" sun="1" mon="0" tue="0" wed="0" thu="0" fri="0" sat="1"/>
      <days>
        <date year="2025" month="1" date="1" type="HOLIDAY"/>
      </days>
    </day-types>
  </calendars>
  <tasks>
    <task id="1" name="Tâche A" meeting="false" start="2025-01-06" duration="5" complete="40"/>
    <task id="2" name="Livraison" meeting="true" start="2025-01-13" duration="0" complete="0"/>
  </tasks>
  <resources>
    <resource id="10" name="Bob" function="Default:1"/>
  </resources>
  <allocations>
    <allocation task-id="1" resource-id="10" load="80" responsible="true"/>
  </allocations>
</project>`;

    const imported = importGanttProjectXml(xml);
    expect(imported.team.name).toBe('MonProjet');
    expect(imported.team.calendar.workingDays).toEqual([1, 2, 3, 4, 5]);
    expect(imported.team.calendar.holidays).toContain('2025-01-01');
    expect(imported.tasks).toHaveLength(2);
    expect(imported.tasks[0]!.name).toBe('Tâche A');
    expect(imported.tasks[1]!.type).toBe('milestone');
    expect(imported.resources).toHaveLength(1);
    expect(imported.resources[0]!.name).toBe('Bob');
    // remaining calculé depuis complete=40% → remaining = effort*(1-0.4)
    expect(imported.tasks[0]!.remaining).toBeCloseTo(3, 1);
    // affectation
    expect(imported.tasks[0]!.blocks[0]!.assignments[0]!.units).toBe(80);
  });

  it('round-trip : export puis import conserve les noms et tâches', () => {
    const { file } = makeMinimalFile();
    const schedule = computeSchedule(file, '2025-01-06');
    const xml = exportGanttProjectXml(file, schedule);
    const reimported = importGanttProjectXml(xml);

    const names = reimported.tasks.map((t) => t.name);
    expect(names).toContain('Conception');
    expect(names).toContain('Développement');
    expect(names).toContain('Livraison');

    const livraison = reimported.tasks.find((t) => t.name === 'Livraison');
    expect(livraison?.type).toBe('milestone');

    expect(reimported.team.calendar.holidays).toContain('2025-01-01');
  });

  it('rejette un XML invalide', () => {
    expect(() => importGanttProjectXml('<root/>')).toThrow();
    expect(() => importGanttProjectXml('not xml at all &&&')).toThrow();
  });
});
