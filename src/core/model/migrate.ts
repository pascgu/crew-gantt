import { z } from 'zod';
import { teamFileSchema, normalizeTeamFile } from './schema';
import { FORMAT_VERSION, type TeamFile } from './types';

export class TeamFileError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = 'TeamFileError';
    this.issues = issues;
  }
}

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** Migration v(n) → v(n+1), indexée par version source. Vide tant que formatVersion = 1. */
const migrations: Record<number, Migration> = {};

/**
 * Parse, migre et valide un contenu de fichier équipe.
 * Un fichier corrompu n'entre jamais en mémoire : on jette TeamFileError.
 */
export function parseTeamFile(json: string): TeamFile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new TeamFileError('Ce fichier ne contient pas du JSON valide.');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new TeamFileError("Ce fichier n'est pas un fichier CrewGantt.");
  }
  let obj = raw as Record<string, unknown>;
  if (obj['app'] !== 'CrewGantt') {
    throw new TeamFileError("Ce fichier n'est pas un fichier CrewGantt (champ « app » absent).");
  }
  let version = typeof obj['formatVersion'] === 'number' ? obj['formatVersion'] : 0;
  if (version < 1 || version > FORMAT_VERSION) {
    throw new TeamFileError(
      `Version de format ${version} non prise en charge (cette application lit jusqu'à la version ${FORMAT_VERSION}).`,
    );
  }
  while (version < FORMAT_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      throw new TeamFileError(`Migration manquante depuis la version ${version}.`);
    }
    obj = migrate(obj);
    version += 1;
    obj['formatVersion'] = version;
  }
  const result = teamFileSchema.safeParse(obj);
  if (!result.success) {
    const issues = result.error.issues.map((i: z.core.$ZodIssue) => {
      const path = i.path.join('.');
      return path ? `${path} : ${i.message}` : i.message;
    });
    throw new TeamFileError('Le fichier contient des données invalides.', issues);
  }
  return normalizeTeamFile(result.data);
}

/** Valide puis sérialise — on n'écrit jamais un fichier invalide. */
export function serializeTeamFile(file: TeamFile): string {
  const result = teamFileSchema.safeParse(file);
  if (!result.success) {
    const issues = result.error.issues.map(
      (i: z.core.$ZodIssue) => `${i.path.join('.')} : ${i.message}`,
    );
    throw new TeamFileError("Refus d'écrire un fichier invalide.", issues);
  }
  return JSON.stringify(file, null, 2);
}
