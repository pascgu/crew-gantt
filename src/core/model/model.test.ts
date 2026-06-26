import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTeamFile, serializeTeamFile, TeamFileError } from './migrate';
import { createDemoTeamFile } from './demo';
import { createEmptyTeamFile } from './factory';

const fixturePath = join(__dirname, '../../../tests/fixtures/equipe-web.cgan');
const fixtureJson = readFileSync(fixturePath, 'utf-8');

describe('parseTeamFile', () => {
  it("lit l'exemple du GDD et applique les défauts", () => {
    const file = parseTeamFile(fixtureJson);
    expect(file.team.name).toBe('Équipe Web');
    expect(file.projects).toHaveLength(2);
    expect(file.tasks).toHaveLength(5);

    const maq = file.tasks.find((t) => t.id === 't-maq')!;
    expect(maq.blocks[1]!.to).toBeNull();
    expect(maq.links[0]).toEqual({ on: 't-spec', type: 'after-progress', progressDays: 2, lag: 0 });

    // Défauts appliqués
    const group = file.tasks.find((t) => t.id === 'g-conception')!;
    expect(group.status).toBe('todo');
    expect(group.blocks).toEqual([]);
    expect(group.remaining).toBe(0);

    const milestone = file.tasks.find((t) => t.id === 'm-v1')!;
    expect(milestone.date).toBe('2026-12-04');
    expect(milestone.remaining).toBe(0);

    // remaining absent → effort (sauf done → 0)
    const spec = file.tasks.find((t) => t.id === 't-spec')!;
    expect(spec.remaining).toBe(0);

    // Ressource sans parts projet → tableau vide (= 100 % implicite partout)
    const bob = file.resources.find((r) => r.id === 'r-bob')!;
    expect(bob.projectShares).toEqual([]);
    expect(bob.workingDays).toBeUndefined();
  });

  it('rejette un JSON invalide', () => {
    expect(() => parseTeamFile('{pas du json')).toThrow(TeamFileError);
  });

  it("rejette un fichier qui n'est pas CrewGantt", () => {
    expect(() => parseTeamFile('{"foo": 1}')).toThrow(/CrewGantt/);
    expect(() => parseTeamFile('[1,2]')).toThrow(TeamFileError);
  });

  it('rejette une version de format inconnue', () => {
    expect(() => parseTeamFile('{"app":"CrewGantt","formatVersion":99}')).toThrow(/99/);
  });

  it('rejette des données invalides avec le chemin du problème', () => {
    const bad = JSON.parse(fixtureJson) as { tasks: { blocks?: { from: string }[] }[] };
    bad.tasks[2]!.blocks![0]!.from = '08/09/2026';
    try {
      parseTeamFile(JSON.stringify(bad));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(TeamFileError);
      expect((e as TeamFileError).issues.join('\n')).toContain('tasks.2.blocks.0.from');
    }
  });

  it('rejette une date inexistante', () => {
    const bad = JSON.parse(fixtureJson) as { team: { calendar: { holidays: string[] } } };
    bad.team.calendar.holidays.push('2026-13-45');
    expect(() => parseTeamFile(JSON.stringify(bad))).toThrow(TeamFileError);
  });
});

describe('serializeTeamFile', () => {
  it('round-trip sans perte', () => {
    const file = parseTeamFile(fixtureJson);
    const reparsed = parseTeamFile(serializeTeamFile(file));
    expect(reparsed).toEqual(file);
  });

  it("refuse d'écrire un fichier invalide", () => {
    const file = parseTeamFile(fixtureJson);
    file.tasks[0]!.status = 'n_importe_quoi' as never;
    expect(() => serializeTeamFile(file)).toThrow(TeamFileError);
  });
});

describe('fabriques', () => {
  it('le fichier vide est valide', () => {
    const file = createEmptyTeamFile('Test');
    expect(() => serializeTeamFile(file)).not.toThrow();
  });

  it('le fichier démo est valide et round-trip', () => {
    const file = createDemoTeamFile('2026-06-11');
    const reparsed = parseTeamFile(serializeTeamFile(file));
    expect(reparsed).toEqual(file);
    expect(reparsed.tasks.length).toBeGreaterThanOrEqual(15);
    expect(reparsed.projects).toHaveLength(2);
    expect(reparsed.resources).toHaveLength(3);
  });
});
