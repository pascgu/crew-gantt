/** Largeurs des colonnes du tableau arborescent (px). */
export const COLS = {
  name: 270,
  project: 104,
  scheduling: 64,
  estimate: 46,
  effort: 46,
  realized: 46,
  remaining: 46,
  progress: 48,
  assignees: 90,
  start: 60,
  end: 60,
  status: 96,
  group: 120,
} as const;

export const TABLE_WIDTH = Object.values(COLS).reduce((a, b) => a + b, 0);
