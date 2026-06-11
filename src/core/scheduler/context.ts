import type { IsoDate, Resource, TeamFile, Weekday } from '../model/types';
import { addDays, isBetween, weekdayOf } from '../calendar/dates';

/**
 * Contexte de calcul : index et caches construits une fois par recalcul.
 * Toutes les fonctions du moteur le partagent — aucune n'accède au fichier brut.
 */
export interface CalcContext {
  readonly file: TeamFile;
  readonly resourcesById: ReadonlyMap<string, Resource>;
  /** Jour ouvré du calendrier global (motif hebdo + fériés). */
  isGlobalWorkingDay(day: IsoDate): boolean;
  /** Présence d'une ressource un jour donné, 0..1. L'exception datée prime sur tout. */
  presence(resourceId: string, day: IsoDate): number;
  /** Part projet d'une ressource un jour donné, 0..N (peut dépasser 1). Sans entrée : 1. */
  projectShare(resourceId: string, projectId: string, day: IsoDate): number;
  /** Capacité d'une affectation = présence × part projet × units/100. En j-h/jour. */
  assignmentCapacity(resourceId: string, projectId: string, units: number, day: IsoDate): number;
  /** Premier jour ouvré global ≥ day. */
  nextWorkingDay(day: IsoDate): IsoDate;
  /** Décale de n jours ouvrés globaux (n peut être négatif ; n = 0 → day inchangé). */
  addWorkingDays(day: IsoDate, n: number): IsoDate;
}

export function createCalcContext(file: TeamFile): CalcContext {
  const holidays = new Set(file.team.calendar.holidays);
  const globalDays = new Set<Weekday>(file.team.calendar.workingDays);
  const resourcesById = new Map(file.resources.map((r) => [r.id, r]));

  const presenceCache = new Map<string, number>();
  const shareCache = new Map<string, number>();

  function isGlobalWorkingDay(day: IsoDate): boolean {
    return globalDays.has(weekdayOf(day)) && !holidays.has(day);
  }

  function presence(resourceId: string, day: IsoDate): number {
    const key = `${resourceId}|${day}`;
    const cached = presenceCache.get(key);
    if (cached !== undefined) return cached;

    const resource = resourcesById.get(resourceId);
    let value = 0;
    if (resource) {
      // L'exception datée prime sur tout (fériés, motif hebdo) ; la dernière qui couvre s'applique.
      let exception: number | undefined;
      for (const ex of resource.exceptions) {
        if (isBetween(day, ex.from, ex.to ?? ex.from)) exception = ex.percent / 100;
      }
      if (exception !== undefined) {
        value = exception;
      } else if (holidays.has(day)) {
        value = 0;
      } else {
        const pattern = resource.workingDays ?? file.team.calendar.workingDays;
        value = pattern.includes(weekdayOf(day)) ? 1 : 0;
      }
    }
    presenceCache.set(key, value);
    return value;
  }

  function projectShare(resourceId: string, projectId: string, day: IsoDate): number {
    const key = `${resourceId}|${projectId}|${day}`;
    const cached = shareCache.get(key);
    if (cached !== undefined) return cached;

    const resource = resourcesById.get(resourceId);
    let value = 1;
    if (resource) {
      // La dernière entrée du tableau couvrant la date s'applique, projet par projet.
      let found: number | undefined;
      for (const share of resource.projectShares) {
        if (share.projectId === projectId && isBetween(day, share.from, share.to)) {
          found = share.percent / 100;
        }
      }
      if (found !== undefined) value = found;
    }
    shareCache.set(key, value);
    return value;
  }

  function assignmentCapacity(
    resourceId: string,
    projectId: string,
    units: number,
    day: IsoDate,
  ): number {
    const p = presence(resourceId, day);
    if (p === 0) return 0;
    return p * projectShare(resourceId, projectId, day) * (units / 100);
  }

  function nextWorkingDay(day: IsoDate): IsoDate {
    let d = day;
    let guard = 0;
    while (!isGlobalWorkingDay(d)) {
      d = addDays(d, 1);
      if (++guard > 400) return day; // calendrier sans jour ouvré : on abandonne proprement
    }
    return d;
  }

  function addWorkingDays(day: IsoDate, n: number): IsoDate {
    if (n === 0) return day;
    const step = n > 0 ? 1 : -1;
    let remaining = Math.abs(n);
    let d = day;
    let guard = 0;
    while (remaining > 0) {
      d = addDays(d, step);
      if (isGlobalWorkingDay(d)) remaining -= 1;
      if (++guard > 10_000) return d;
    }
    return d;
  }

  return {
    file,
    resourcesById,
    isGlobalWorkingDay,
    presence,
    projectShare,
    assignmentCapacity,
    nextWorkingDay,
    addWorkingDays,
  };
}
