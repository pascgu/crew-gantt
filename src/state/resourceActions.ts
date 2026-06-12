import { createResource } from '@/core/model/factory';
import type {
  CalendarException,
  ProjectShare,
  Resource,
  TeamFile,
  Weekday,
} from '@/core/model/types';
import { useAppStore } from './store';

const mutate = (fn: (file: TeamFile) => void) => useAppStore.getState().mutate(fn);

function resourceById(file: TeamFile, id: string): Resource | undefined {
  return file.resources.find((r) => r.id === id);
}

export function addResource(name: string): string {
  const resource = createResource({ name });
  mutate((file) => {
    file.resources.push(resource);
  });
  return resource.id;
}

export function updateResource(id: string, patch: Partial<Resource>): void {
  mutate((file) => {
    const resource = resourceById(file, id);
    if (resource) Object.assign(resource, patch);
  });
}

/** Supprime la ressource et la retire de toutes les affectations de blocs. */
export function deleteResource(id: string): void {
  mutate((file) => {
    file.resources = file.resources.filter((r) => r.id !== id);
    for (const task of file.tasks) {
      for (const block of task.blocks) {
        block.assignments = block.assignments.filter((a) => a.resourceId !== id);
      }
    }
  });
}

/** Bascule un jour du motif hebdo perso ; crée le motif depuis le global au premier écart. */
export function toggleResourceDay(id: string, day: Weekday): void {
  mutate((file) => {
    const resource = resourceById(file, id);
    if (!resource) return;
    const pattern = resource.workingDays ?? [...file.team.calendar.workingDays];
    const i = pattern.indexOf(day);
    if (i >= 0) pattern.splice(i, 1);
    else {
      pattern.push(day);
      pattern.sort((a, b) => a - b);
    }
    resource.workingDays = pattern;
  });
}

/** Revenir au motif du calendrier global. */
export function resetResourceDays(id: string): void {
  mutate((file) => {
    const resource = resourceById(file, id);
    if (resource) delete resource.workingDays;
  });
}

export function addException(id: string, exception: CalendarException): void {
  mutate((file) => {
    const resource = resourceById(file, id);
    if (!resource) return;
    resource.exceptions.push(exception);
    resource.exceptions.sort((a, b) => a.from.localeCompare(b.from));
  });
}

export function updateException(
  id: string,
  index: number,
  patch: Partial<CalendarException>,
): void {
  mutate((file) => {
    const exception = resourceById(file, id)?.exceptions[index];
    if (!exception) return;
    if ('to' in patch && patch.to === undefined) delete exception.to;
    Object.assign(exception, patch);
  });
}

export function removeException(id: string, index: number): void {
  mutate((file) => {
    const resource = resourceById(file, id);
    if (resource) resource.exceptions.splice(index, 1);
  });
}

export function addProjectShare(id: string, share: ProjectShare): void {
  mutate((file) => {
    const resource = resourceById(file, id);
    if (!resource) return;
    resource.projectShares.push(share);
    resource.projectShares.sort((a, b) => a.from.localeCompare(b.from));
  });
}

export function updateProjectShare(id: string, index: number, patch: Partial<ProjectShare>): void {
  mutate((file) => {
    const share = resourceById(file, id)?.projectShares[index];
    if (!share) return;
    if ('to' in patch && patch.to === undefined) delete share.to;
    Object.assign(share, patch);
  });
}

export function removeProjectShare(id: string, index: number): void {
  mutate((file) => {
    const resource = resourceById(file, id);
    if (resource) resource.projectShares.splice(index, 1);
  });
}
