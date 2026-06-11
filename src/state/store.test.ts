import { beforeEach, describe, expect, it } from 'vitest';
import { clearHistory, redo, undo, useAppStore } from './store';
import { createEmptyTeamFile } from '@/core/model/factory';

beforeEach(() => {
  useAppStore.getState().replaceFile(createEmptyTeamFile('Test'), null);
  clearHistory();
});

describe('store', () => {
  it('mutate marque le fichier modifié', () => {
    expect(useAppStore.getState().dirty).toBe(false);
    useAppStore.getState().mutate((f) => {
      f.team.name = 'Renommée';
    });
    expect(useAppStore.getState().file.team.name).toBe('Renommée');
    expect(useAppStore.getState().dirty).toBe(true);
  });

  it('undo / redo sur les données métier', () => {
    useAppStore.getState().mutate((f) => {
      f.team.name = 'V1';
    });
    useAppStore.getState().mutate((f) => {
      f.team.name = 'V2';
    });
    undo();
    expect(useAppStore.getState().file.team.name).toBe('V1');
    undo();
    expect(useAppStore.getState().file.team.name).toBe('Test');
    redo();
    expect(useAppStore.getState().file.team.name).toBe('V1');
    redo();
    expect(useAppStore.getState().file.team.name).toBe('V2');
    redo(); // au-delà : sans effet
    expect(useAppStore.getState().file.team.name).toBe('V2');
  });

  it("les changements d'UI ne créent pas d'étape d'historique", () => {
    useAppStore.getState().mutate((f) => {
      f.team.name = 'V1';
    });
    const past = useAppStore.temporal.getState().pastStates.length;
    useAppStore.getState().setActiveTab('meeting');
    useAppStore.getState().selectTask('x');
    expect(useAppStore.temporal.getState().pastStates.length).toBe(past);
  });

  it("markSaved enlève l'état modifié sans toucher à l'historique", () => {
    useAppStore.getState().mutate((f) => {
      f.team.name = 'V1';
    });
    useAppStore.getState().markSaved();
    expect(useAppStore.getState().dirty).toBe(false);
    undo();
    expect(useAppStore.getState().file.team.name).toBe('Test');
  });
});
